"""Package static frontend and a runnable Node server without credentials or data."""

import hashlib
import json
from pathlib import Path
import zipfile

root = Path(__file__).resolve().parents[1]
dist = root / "dist"
for required in ("index.html", "catalog.json"):
    if not (dist / required).is_file():
        raise SystemExit("Missing build output: " + required)

output = root / "release"
output.mkdir(exist_ok=True)
archive = output / "xuejin-pricelist.zip"
files = sorted(path for path in dist.rglob("*") if path.is_file())
for path in files:
    if not path.resolve().is_relative_to(dist.resolve()):
        raise SystemExit("Build output contains a link outside dist")
    if path.name.startswith(".env") or path.suffix == ".bak":
        raise SystemExit("Unexpected local file in build output")
with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as bundle:
    for path in files:
        bundle.write(path, path.relative_to(dist).as_posix())
digest = hashlib.sha256(archive.read_bytes()).hexdigest()
with zipfile.ZipFile(archive) as bundle:
    if bundle.testzip() is not None:
        raise SystemExit("Archive integrity check failed")
print(json.dumps({"archive": str(archive), "bytes": archive.stat().st_size,
                  "files": len(files), "sha256": digest}, ensure_ascii=False))

runtime = ["package.json", "package-lock.json", "README.md", "DEPLOY.md", "src/catalog.ts", "public/catalog.json"]
runtime_files = [root / name for name in runtime]
runtime_files += sorted((root / "server").rglob("*.mjs"))
runtime_files += sorted(path for path in (root / "deploy").rglob("*") if path.is_file())
runtime_files += files
server_archive = output / "xuejin-pricelist-server.zip"
with zipfile.ZipFile(server_archive, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as bundle:
    for path in runtime_files:
        if not path.resolve().is_relative_to(root.resolve()) or path.is_symlink():
            raise SystemExit("Unexpected runtime file")
        bundle.write(path, path.relative_to(root).as_posix())
with zipfile.ZipFile(server_archive) as bundle:
    if bundle.testzip() is not None:
        raise SystemExit("Server archive integrity check failed")
server_digest = hashlib.sha256(server_archive.read_bytes()).hexdigest()
(output / "SHA256SUMS").write_text(digest + "  " + archive.name + "\n" + server_digest + "  " + server_archive.name + "\n", encoding="utf-8")
print(json.dumps({"archive": str(server_archive), "bytes": server_archive.stat().st_size,
                  "files": len(runtime_files), "sha256": server_digest}, ensure_ascii=False))
