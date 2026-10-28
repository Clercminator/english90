"""Package only validated dist files; never the source workspace."""
from pathlib import Path
import subprocess
import zipfile

root = Path(__file__).resolve().parents[1]
subprocess.run(['node', 'scripts/check-public-build.mjs'], cwd=root, check=True)
target = root / 'release' / 'English_90_Trainer_V3.2_Public.zip'
target.parent.mkdir(exist_ok=True)
files = sorted(p for p in (root / 'dist').rglob('*') if p.is_file())
with zipfile.ZipFile(target, 'w', zipfile.ZIP_DEFLATED) as archive:
    for path in files:
        archive.write(path, path.relative_to(root / 'dist').as_posix())
with zipfile.ZipFile(target) as archive:
    assert set(archive.namelist()) == {p.relative_to(root / 'dist').as_posix() for p in files}
    for path in files:
        assert archive.read(path.relative_to(root / 'dist').as_posix()) == path.read_bytes()
print(f'Public archive verified: {len(files)} files. No private source or delivery files included.')
