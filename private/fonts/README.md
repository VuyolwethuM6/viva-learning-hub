# PDF fonts

Plus Jakarta Sans is licensed under the SIL Open Font License 1.1 in [OFL.txt](OFL.txt).

The source variable font was downloaded on 2026-10-26 from the Google Fonts repository:
https://github.com/google/fonts/blob/main/ofl/plusjakartasans/PlusJakartaSans%5Bwght%5D.ttf

The checked-in `PlusJakartaSans.ttf` source has SHA-256:
`89b3fb38aa0d275d7a731d0d817a4f1622b316b4d7fbdedcf02ee9099ff68bc8`.

The static Regular and Bold TTF files were generated from this source using
fontTools 4.61.1, instantiating the `wght` axis at 400 and 700 respectively.
They retain the complete character map. The PDF renderer embeds subsets of these
fonts; browser CSS separately uses the self-hosted `@fontsource` package.

To regenerate with fontTools installed:

```python
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

for weight, name in [(400, "Regular"), (700, "Bold")]:
    font = TTFont("private/fonts/PlusJakartaSans.ttf")
    instantiateVariableFont(font, {"wght": weight}, inplace=True).save(
        f"private/fonts/PlusJakartaSans-{name}.ttf"
    )
```

Vercel bundles the static TTFs into the private document and message functions.
Do not replace these files with a web font language subset: a Latin Extended
subset can omit ordinary Latin letters and silently produce unreadable PDFs.
