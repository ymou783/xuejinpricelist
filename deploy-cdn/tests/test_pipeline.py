"""Offline regression checks. These do not prove the user's cloud is configured."""

import contextlib
import importlib.util
import io
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

TOOL_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(TOOL_DIR))
import upload
import purge

spec = importlib.util.spec_from_file_location("rewrite", TOOL_DIR / "rewrite-html.py")
rewrite = importlib.util.module_from_spec(spec)
spec.loader.exec_module(rewrite)


class NotFound(Exception):
    def get_status_code(self):
        return 404


class FakeCOS:
    def __init__(self):
        self.objects = {}
        self.fail_key = None
        self.uploads = 0

    def head_object(self, Bucket, Key):
        if Key not in self.objects:
            raise NotFound()
        return {"x-cos-meta-sha256": self.objects[Key]}

    def put_object_from_local_file(self, **kwargs):
        if self.fail_key and self.fail_key in kwargs["Key"]:
            raise PermissionError("simulated cloud upload denial")
        self.objects[kwargs["Key"]] = kwargs["Metadata"]["sha256"]
        self.uploads += 1


class PipelineTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.images = self.root / "images"
        self.images.mkdir()
        self.image = self.images / "a.jpg"
        self.image.write_bytes(b"representative image content")
        self.cfg = {
            "_config_dir": self.root, "local_image_dir": "images", "local_site_dir": "dist",
            "cdn_domain": "img.fixture.test", "bucket": "fixture-123", "region": "ap-guangzhou",
            "source_image_prefix": "images", "cos_prefix": "images", "hash_filenames": True,
            "convert_webp": True, "thumbnail_width": 1200, "eo_zone_name": "fixture.test",
        }

    def test_content_change_changes_url_and_paths_match_site(self):
        source, first = upload.build_entry(self.cfg, self.images, self.image)
        self.assertEqual(source, "images/a.jpg")
        self.assertIn("immutable", first["cache_control"])
        self.image.write_bytes(b"changed image")
        _, second = upload.build_entry(self.cfg, self.images, self.image)
        self.assertNotEqual(first["cdn_url"], second["cdn_url"])
        self.cfg["hash_filenames"] = False
        _, fixed = upload.build_entry(self.cfg, self.images, self.image)
        self.assertNotIn("immutable", fixed["cache_control"])

    def test_urls_encode_names_and_skip_gif_conversion(self):
        image = self.images / "中文 #1.GIF"
        image.write_bytes(b"GIF89a")
        _, entry = upload.build_entry(self.cfg, self.images, image)
        self.assertIn("%23", entry["cdn_url"])
        self.assertNotIn(" ", entry["cdn_url"])
        self.assertNotIn("imageMogr2", entry["cdn_url"])

    def test_dry_run_works_without_credentials_and_writes_nothing(self):
        with patch.object(upload, "build_client", side_effect=AssertionError("cloud must not be called")):
            with contextlib.redirect_stdout(io.StringIO()):
                upload.run(self.cfg, dry_run=True)
        self.assertFalse((self.root / "url-map.json").exists())
        self.assertFalse((self.root / "url-map.csv").exists())

    def test_upload_repeat_and_failure_preserves_previous_map(self):
        client = FakeCOS()
        with patch.object(upload, "build_client", return_value=client), contextlib.redirect_stdout(io.StringIO()):
            upload.run(self.cfg)
            upload.run(self.cfg)
            self.assertEqual(client.uploads, 1)
            previous = (self.root / "url-map.json").read_bytes()
            (self.images / "b.jpg").write_bytes(b"new image")
            client.fail_key = "b."
            with self.assertRaises(PermissionError):
                upload.run(self.cfg)
        self.assertEqual((self.root / "url-map.json").read_bytes(), previous)

    def test_permission_failure_is_not_treated_as_missing_object(self):
        client = FakeCOS()
        client.head_object = lambda **kwargs: (_ for _ in ()).throw(PermissionError("denied"))
        with self.assertRaises(PermissionError):
            upload.object_unchanged(client, "fixture", {"cos_key": "a.jpg", "sha256": "123"})

    def test_rewrite_paths_preserve_external_urls_and_repeat_safely(self):
        source, entry = upload.build_entry(self.cfg, self.images, self.image)
        mapping = {source: entry}
        text = ('<img src="images/a.jpg"><img src="./images/a.jpg"><img src="/images/a.jpg">'
                '<img src="https://other.test/images/a.jpg"><img src="../images/a.jpg">'
                '<img src="images/a.jpg?v=2#detail">')
        changed, hits = rewrite.replace_paths(text, mapping)
        self.assertEqual(hits, 4)
        self.assertIn('src="https://other.test/images/a.jpg"', changed)
        self.assertIn('src="../images/a.jpg"', changed)
        self.assertIn("&v=2#detail", changed)
        again, repeated_hits = rewrite.replace_paths(changed, mapping)
        self.assertEqual(repeated_hits, 0)
        self.assertEqual(again, changed)

    def test_image_loading_preserves_priority_and_self_closing_syntax(self):
        text = ('<img src="first.jpg" /><img src="second.jpg" />'
                '<img src="hero.jpg" fetchpriority="high">'
                '<img src="last.jpg" loading="eager" decoding="sync">')
        changed, count = rewrite.add_lazy(text)
        self.assertEqual(count, 3)
        self.assertIn('src="first.jpg" loading="eager" decoding="async" />', changed)
        self.assertIn('src="second.jpg" loading="lazy" decoding="async" />', changed)
        self.assertIn('fetchpriority="high" loading="eager"', changed)
        self.assertIn('loading="eager" decoding="sync"', changed)
        self.assertEqual(rewrite.add_lazy(changed), (changed, 0))

    def test_rewrite_dry_run_backup_and_repeat(self):
        client = FakeCOS()
        with patch.object(upload, "build_client", return_value=client), contextlib.redirect_stdout(io.StringIO()):
            upload.run(self.cfg)
        site = self.root / "dist"
        site.mkdir()
        page = site / "index.html"
        initial = '<img src="images/a.jpg" /><img src="images/a.jpg">'
        page.write_text(initial)
        with contextlib.redirect_stdout(io.StringIO()):
            rewrite.run(self.cfg, dry_run=True)
            self.assertEqual(page.read_text(), initial)
            self.assertFalse(page.with_suffix(".html.bak").exists())
            rewrite.run(self.cfg)
            first = page.read_text()
            rewrite.run(self.cfg)
        self.assertIn('https://img.fixture.test/', first)
        self.assertEqual(page.read_text(), first)
        self.assertEqual(page.with_suffix(".html.bak").read_text(), initial)

    def test_purge_preview_needs_no_credentials_and_rejects_other_hosts(self):
        with patch.object(purge, "credentials", side_effect=AssertionError("not needed")):
            with contextlib.redirect_stdout(io.StringIO()):
                purge.run(self.cfg, "purge_url", ["https://img.fixture.test/images/a.jpg"], dry_run=True)
        with self.assertRaises(ValueError):
            purge.run(self.cfg, "purge_host", ["unrelated.test"], dry_run=True)


if __name__ == "__main__":
    unittest.main()
