# Testing dataset: a public PDF corpus in a thematic folder tree

## What it is

A recipe for building, on your own disk, a nested folder tree of 1,075 real PDF documents to test
indexing and search over folder hierarchies. The documents come from a public Kaggle dataset: a
sample of `.gov` PDFs from the Library of Congress web archive, plus guidance documents on
humanitarian data in English, French, Spanish and other languages. This folder commits only the
description of the data: a listing of the archive with checksums, a mapping that places each file
in a 63-folder thematic tree, and the script that applies the mapping. The PDFs are never committed.

## Layout

```
data/
  README.md                 this file
  .gitignore                keeps the real files out of git
  testing-dataset.json      listing of the unzipped archive: path, size, SHA-256 of every file
  testing-thematic.json     the thematic tree: folder descriptions + one entry per placed file
  make-thematic-tree.mjs    applies the mapping: archive files → thematic tree
  testing-dataset/          (ignored) the unzipped archive, as downloaded
  testing-thematic/         (ignored) the generated tree
```

The tree has three levels. Twelve top-level themes (`congress-and-legislation`, `courts-and-adjudication`,
`international-and-humanitarian`, …) each hold two to five subject folders. Two large subject folders are
split once more: `congress-and-legislation/member-press-releases` by subject, and
`international-and-humanitarian/humanitarian-data-responsibility` by language. Folder sizes range from 2
to 54 documents.

## How to rebuild the tree

Run from the repository root.

1. **Download the archive** from <https://www.kaggle.com/datasets/manisha717/dataset-of-pdf-files>.
   Use the *Download* button (needs a free Kaggle account), or the Kaggle CLI with an API token in
   `~/.kaggle/kaggle.json`:

   ```sh
   kaggle datasets download manisha717/dataset-of-pdf-files -p data/
   mv data/dataset-of-pdf-files.zip data/archive.zip
   ```

   The archive is about 806 MB (`archive.zip`, 1,078 files, about 907 MB unzipped).

2. **Unzip it into `data/testing-dataset/`**, keeping the archive's own `Pdf/` folder:

   ```sh
   unzip data/archive.zip -d data/testing-dataset
   ```

   You now have `data/testing-dataset/Pdf/*.pdf`, plus `lcwa_gov_pdf_metadata.csv` and `README.txt`.

3. **Build the tree:**

   ```sh
   node data/make-thematic-tree.mjs --source data/testing-dataset --target data/testing-thematic
   ```

   It prints `placed 1075 files under data/testing-thematic`. Point a wiki project at that folder, or at
   any subfolder of it.

Both locations are arguments, so the data can live outside the repository: `--source` is wherever you
unzipped the archive, and `--target` is any new directory.

## Why it is built this way

- **A mapping, not a copy of the files.** The PDFs are someone else's published dataset, and they total
  close to a gigabyte. Committing the listing and the mapping keeps the repository small and makes the
  tree reproducible from the original source.
- **Every file is checked before it is placed.** The script compares each source file's size and SHA-256
  with `testing-dataset.json`. A test result can only be compared with another one when both runs used
  the same bytes.
- **Hard links by default.** The tree costs no extra disk space and is built in about a second.
  `--copy` exists for when the tree must be edited without touching the archive.
- **File names are kept.** The archive names each file by a unique ID: a Base32 SHA-1 digest for the
  Library of Congress files, a hex ID for the humanitarian documents. The same name identifies the same
  document in the flat archive and in the tree, so results from the two layouts can be compared file by
  file.
- **Themes from content, not from source URLs.** Grouping by web host would mostly give one folder per
  agency, a split that has little to do with what the documents discuss. Each document was placed by
  subject and genre, judged from its source URL, PDF title and the text of its first pages.
- **Some folders hold both documents and subfolders.** `member-press-releases` keeps 20 general
  documents next to its six subject subfolders. An index over a folder then has to combine its own
  documents with what its subfolders report.
- **The multilingual folder is split by language**, so a test can query one language's folder, or the
  parent folder across all languages.
- **What was left out.** `lcwa_gov_pdf_metadata.csv` and the archive's `README.txt` describe the dataset
  and are not documents, so the tree leaves them out. So does `Pdf/536b64435024c919d6b4c3f5819a889d0607f349 (1).pdf`,
  a byte-identical copy of `Pdf/536b64435024c919d6b4c3f5819a889d0607f349.pdf`.

## What will surprise you

- **125 documents have no text.** They are scanned images with no text layer (maps, survey sheets,
  faxed letters). Their mapping entry has `"text": false`. Without OCR they yield empty content, and
  they belong to the folder their URL and title suggest. Filter on `text` when a test needs only
  readable documents.
- **The placement is a judgement, not ground truth.** Documents were classified automatically from the
  start of their text. Some sit between two folders (a bill discussed in a press release, a forestry
  plan filed under plant health). Tests should check the indexer's behaviour on a given tree, not
  whether the tree is the "right" classification.
- **The archive checksum may not match.** `testing-dataset.json` records the SHA-256 of the archive as
  downloaded in October 2026. If Kaggle repackages it, the zip's checksum changes while every file inside
  stays the same. The per-file checks are the authoritative ones.
- **Errors are listed per file, then the script exits with code 1:**
  - `Pdf/<id>.pdf: missing in <source>`: wrong `--source`. It must be the folder that *contains* `Pdf/`,
    not `Pdf/` itself.
  - `Pdf/<id>.pdf: size or SHA-256 differs from testing-dataset.json`: a different or damaged download.
  - `<n> of 1075 files were not placed`: the summary line after the errors. Files that passed the check
    were still placed.
- **Editing a file in the tree edits the archive.** Hard links share the same bytes. Rebuild with
  `--copy` before changing documents. When source and target are on different file systems, the script
  copies automatically.
- **The metadata CSV is Latin-1, not UTF-8.** Open it with `encoding="latin-1"`.

## Reference

`testing-dataset.json`:

```json
{
  "source": { "url": "…", "archive": "archive.zip", "archiveSha256": "…", "fileCount": 1078, "totalSize": 907387012 },
  "files": [{ "path": "Pdf/<id>.pdf", "size": 401107, "sha256": "…" }]
}
```

`testing-thematic.json`:

```json
{
  "dataset": "testing-dataset.json",
  "folders": { "<folder path>": "<what belongs there>" },
  "files": [{ "path": "<folder path>/<id>.pdf", "source": "Pdf/<id>.pdf", "text": true }]
}
```

`make-thematic-tree.mjs` options:

| Option | Meaning |
|---|---|
| `--source <dir>` | The unzipped archive, the folder that contains `Pdf/`. Required. |
| `--target <dir>` | Where the tree is built. Created if missing; files already placed are replaced. Required. |
| `--copy` | Copy files instead of hard-linking them. |

The script needs Node.js and nothing else.

The source documents are published by the Library of Congress, and the Kaggle dataset restates its
rights statement in the archive's `README.txt`. Check it before redistributing any document.
