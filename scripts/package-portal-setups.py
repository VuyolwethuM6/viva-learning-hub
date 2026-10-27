"""Package reviewable SQL and portal guides using only Python's standard library."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'docs/downloads'
OUT.mkdir(exist_ok=True)


def package(name, entries, readme):
    target = OUT / name
    with ZipFile(target, 'w', ZIP_DEFLATED) as archive:
        for source, destination in entries:
            archive.write(ROOT / source, destination)
        archive.writestr('READ-ME.txt', readme)
    with ZipFile(target) as archive:
        assert archive.testzip() is None
        for source, destination in entries:
            assert archive.read(destination) == (ROOT / source).read_bytes()
    print(f'Verified {target.relative_to(ROOT)}')


package('viva-academic-setup.zip', [
    ('docs/academic-setup.sql', 'academic-setup.sql'),
    ('docs/academic-workflow.md', 'academic-workflow.md'),
    ('docs/teaching-setup.sql', 'teaching-setup.sql'),
], 'Viva Tutorials academic workflow release.\nExisting connected student/tutor/parent setup: run ALL academic-setup.sql in Supabase SQL Editor, including commit. No reset. Read academic-workflow.md first. Fresh teaching installation: use the complete teaching-setup.sql after parent setup. Existing portal Auth settings are reused. Deploy work and complete the controlled test journey.\n')

package('viva-teaching-setup.zip', [
    ('docs/teaching-setup.sql', 'teaching-setup.sql'),
    ('docs/connected-portals-upgrade.sql', 'connected-portals-upgrade.sql'),
    ('docs/connected-portals.md', 'connected-portals.md'),
    ('docs/teaching-test-guide.md', 'teaching-test-guide.md'),
    ('docs/parent-signin-email.html', 'shared-portal-signin-email.html'),
    ('docs/academic-setup.sql', 'academic-setup.sql'),
    ('docs/academic-workflow.md', 'academic-workflow.md'),
], 'Viva Tutorials teaching and academic setup.\nRead connected-portals.md and academic-workflow.md. The complete teaching-setup.sql now includes the academic migration and runs after parent setup. Existing connected installations need only academic-setup.sql for the academic release. No database reset. Run complete SQL files through commit.\n')
