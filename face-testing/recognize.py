#!/usr/bin/env python3
"""
recognize.py - compare InsightFace and AdaFace recognition models on classroom / CCTV images (CPU only).

Setup:    pip install insightface onnxruntime opencv-python numpy
For AdaFace packs, also (only needed ONCE, to convert the checkpoint to .onnx - see below):
          pip install torch --index-url https://download.pytorch.org/whl/cpu   (the small CPU-only build)
          pip install gdown    (downloads the AdaFace .ckpt files from Google Drive)

Folders (all next to this script):
    models/    InsightFace packs, and AdaFace files under models/adaface/
    gallery/   one sub-folder per student, e.g. gallery/asha/1.jpg, gallery/asha/2.jpg
    cache/     saved gallery embeddings, so they are not recomputed on every run
    outputs/   annotated images + timings.csv (change with --out)

Examples:
    python recognize.py --image tests/cctv1.jpg --pack antelopev2 --det-size 1280x736
    python recognize.py --image tests/ --pack all --out outputs/f104
    python recognize.py --image tests/ --pack adaface_ir101 --det-size 1280x736

AdaFace (https://github.com/mk-minchul/AdaFace, MIT licence) publishes its weights as a pytorch
.ckpt file and does not ship an ONNX version. So the first time you run an adaface_* pack, this
script downloads that .ckpt and converts it to .onnx itself (needs torch + gdown, see above);
every run after that loads the saved .onnx file through onnxruntime, same as the InsightFace
packs, and torch is not needed any more. This conversion was checked against the original pytorch
model and matches to about 1e-7 (see the chat this script was built in).

AdaFace also ships no production-ready face detector of its own (its demo uses MTCNN, which
misses too many faces on CCTV footage). So for an adaface_* pack, this script uses an InsightFace
SCRFD detector instead - pick which one with --detector (default buffalo_l, i.e. SCRFD-10g) -
purely to find faces and their 5-point landmarks, then hands the aligned 112x112 crop to AdaFace's
recognizer. This works because both projects align faces to the exact same reference points
(verified: see the chat this script was built in), so it is not a hack, just an accurate detector
paired with AdaFace's own recognizer.

Box colours:  green = match | orange = borderline | red = unknown | gray = too small | blue = no gallery
"""
import argparse
import csv
import shutil
import sys
import time
from datetime import datetime
from pathlib import Path

import cv2
import numpy as np
import onnxruntime

try:
    from insightface.app import FaceAnalysis
    from insightface.app.common import Face
except ImportError:
    sys.exit("InsightFace is missing. Run: pip install insightface onnxruntime opencv-python numpy")

# ------------------------------------------------------------------ settings
HERE = Path(__file__).resolve().parent                        # the folder this script lives in
PACKS = ["buffalo_s", "buffalo_m", "buffalo_l", "antelopev2"]  # what "--pack all" runs
IMAGE_TYPES = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}
GALLERY_DET_SIZE = (640, 640)   # gallery photos are close-ups, so a small detector input is enough
FONT = cv2.FONT_HERSHEY_SIMPLEX

# Box colours as (Blue, Green, Red) - OpenCV uses BGR order, not RGB
COLORS = {"match": (0, 200, 0), "borderline": (0, 140, 255), "unknown": (0, 0, 230),
          "small": (150, 150, 150), "detected": (230, 160, 30)}

# Columns of timings.csv (summarize.py reads these, so keep the names as they are)
CSV_COLUMNS = ["timestamp", "image", "pack", "det_model", "rec_model", "det_size", "provider", "img_w", "img_h",
               "runs", "faces", "match", "borderline", "unknown", "small", "det_ms", "rec_ms", "total_ms",
               "threshold", "recognized", "image_set", "det_thresh", "min_face", "gallery_ids", "gallery_imgs",
               "rec_ms_per_face", "model_mb"]

# AdaFace packs this script offers, roughly matching the size ladder of the InsightFace packs
# (ir_18 ~ buffalo_s, ir_50 ~ buffalo_l, ir_101 ~ antelopev2). "architecture" is the name AdaFace's
# own code uses internally; "file_id" is the Google Drive file id from AdaFace's official README
# (https://github.com/mk-minchul/AdaFace#pretrained-models); "filename" is what we save it as.
ADAFACE_PACKS = {
    "adaface_ir18": dict(architecture="ir_18", filename="adaface_ir18_webface4m.ckpt",
                         file_id="1J17_QW1Oq00EhSWObISnhWEYr2NNrg2y"),
    "adaface_ir50": dict(architecture="ir_50", filename="adaface_ir50_webface4m.ckpt",
                         file_id="1BmDRrhPsHSbXcWZoYFPJg2KJn1sd3QpN"),
    "adaface_ir101": dict(architecture="ir_101", filename="adaface_ir101_webface4m.ckpt",
                                  file_id="18jQkqB0avFqWa0Pas52g54xNshUOQJpQ"),
    "adaface_ir101": dict(architecture="ir_101", filename="adaface_ir101_webface12m.ckpt",
                          file_id="1dswnavflETcnAuplZj1IOKKP0eM8ITgT")
}


# ------------------------------------------------------------ small helpers
def load_image(path):
    """Read an image file (also works when the path has non-English characters)."""
    image = cv2.imdecode(np.fromfile(str(path), dtype=np.uint8), cv2.IMREAD_COLOR)
    if image is None:
        raise ValueError(f"Cannot read image: {path}")
    return image


def save_image(path, image):
    """Save an image as .jpg (also works when the path has non-English characters)."""
    _, encoded = cv2.imencode(".jpg", image)
    encoded.tofile(str(path))


def find_images(path):
    """Return a list of image files: the file itself, or every image inside a folder."""
    path = Path(path)
    if path.is_file():
        return [path]
    if path.is_dir():
        return sorted(p for p in path.iterdir() if p.suffix.lower() in IMAGE_TYPES)
    sys.exit(f"Not found: {path}")


def parse_det_size(text):
    """'1280x736' -> (1280, 736); '640' -> (640, 640). The detector needs multiples of 32, so we round up."""
    parts = text.lower().split("x")
    width, height = int(parts[0]), int(parts[-1])  # a single number means a square size
    return (width + 31) // 32 * 32, (height + 31) // 32 * 32


def face_size(face):
    """Width and height of a detected face box, in pixels."""
    x1, y1, x2, y2 = face.bbox
    return x2 - x1, y2 - y1


def prepare_csv(csv_path):
    """Create timings.csv with a header row, or check that an existing file has the same columns."""
    if not csv_path.exists():
        with open(csv_path, "w", newline="", encoding="utf-8") as file:
            csv.writer(file).writerow(CSV_COLUMNS)
        return
    with open(csv_path, newline="", encoding="utf-8-sig") as file:
        existing_columns = next(csv.reader(file), [])
    if existing_columns != CSV_COLUMNS:
        sys.exit(f"{csv_path} has different columns (made by another version). "
                 f"Rename it, or use --out with a new folder.")


# -------------------------------------------------------------------- model
def flatten_nested_folder(pack):
    """antelopev2's zip sometimes unpacks to models/antelopev2/antelopev2/*.onnx. Move the files up one level."""
    pack_dir = HERE / "models" / pack
    nested_dir = pack_dir / pack
    if nested_dir.is_dir() and not any(pack_dir.glob("*.onnx")):
        for file in nested_dir.iterdir():
            shutil.move(str(file), str(pack_dir / file.name))
        nested_dir.rmdir()


def load_pack(pack, modules=("detection", "recognition")):
    """Load an InsightFace pack (downloading it on first use). `modules` picks what to keep loaded."""
    flatten_nested_folder(pack)
    return FaceAnalysis(name=pack, root=str(HERE), allowed_modules=list(modules),
                        providers=["CPUExecutionProvider"])


def download_adaface_checkpoint(pack):
    """Download an AdaFace .ckpt from Google Drive (only needed once, to convert it to .onnx below)."""
    info = ADAFACE_PACKS[pack]
    ckpt_path = HERE / "models" / "adaface" / info["filename"]
    if ckpt_path.exists():
        return ckpt_path
    ckpt_path.parent.mkdir(parents=True, exist_ok=True)
    try:
        import gdown
    except ImportError:
        sys.exit("AdaFace checkpoints download via gdown. Run: pip install gdown")
    print(f"  downloading {info['filename']} (one-off, can be a few hundred MB) ...")
    try:
        gdown.download(id=info["file_id"], output=str(ckpt_path), quiet=False)
    except Exception as error:
        sys.exit(f"Could not download {info['filename']}: {error}\n"
                 f"Download it by hand from https://drive.google.com/file/d/{info['file_id']}/view "
                 f"and save it as {ckpt_path}")
    if not ckpt_path.exists():
        sys.exit(f"Download did not produce a file (Google Drive sometimes blocks automated downloads for large "
                 f"files). Get it by hand from https://drive.google.com/file/d/{info['file_id']}/view "
                 f"and save it as {ckpt_path}")
    return ckpt_path


def convert_adaface_to_onnx(pack, ckpt_path, onnx_path):
    """
    One-off: build the AdaFace network in pytorch, load the downloaded weights, and export it to
    .onnx. Needs torch, but only this once - every later run loads the saved .onnx file instead
    (see AdaFaceRecognizer below), which is what actually runs on every image.
    """
    try:
        import torch
    except ImportError:
        sys.exit("Converting an AdaFace checkpoint to .onnx needs PyTorch (only for this one-off step). "
                 "Run: pip install torch --index-url https://download.pytorch.org/whl/cpu")
    import adaface_backbone

    print(f"  converting {ckpt_path.name} to .onnx (one-off) ...")
    model = adaface_backbone.build_model(ADAFACE_PACKS[pack]["architecture"])
    checkpoint = torch.load(ckpt_path, map_location="cpu", weights_only=True)["state_dict"]
    # AdaFace saves checkpoints with every weight name prefixed "model.": drop that prefix
    weights = {name[6:]: value for name, value in checkpoint.items() if name.startswith("model.")}
    model.load_state_dict(weights)
    model.eval()

    class EmbeddingOnly(torch.nn.Module):
        """model(x) normally returns (embedding, norm); ONNX export wants a single plain tensor out."""
        def __init__(self, inner):
            super().__init__()
            self.inner = inner

        def forward(self, x):
            embedding, _ = self.inner(x)
            return embedding

    exportable = EmbeddingOnly(model)
    exportable.eval()  # belt-and-suspenders: makes sure BatchNorm/Dropout are in eval mode during export
    export_kwargs = dict(input_names=["input"], output_names=["embedding"], opset_version=17,
                         dynamic_axes={"input": {0: "batch"}, "embedding": {0: "batch"}})
    try:
        # dynamo=False: use the older, more compatible ONNX exporter (the newer one needs an extra
        # 'onnxscript' package). Older torch versions do not have this option at all, hence the fallback.
        torch.onnx.export(exportable, torch.randn(1, 3, 112, 112), str(onnx_path), dynamo=False, **export_kwargs)
    except TypeError:
        torch.onnx.export(exportable, torch.randn(1, 3, 112, 112), str(onnx_path), **export_kwargs)
    print(f"  saved {onnx_path.name} - you can delete {ckpt_path.name} now if you want to save disk space")


class AdaFaceRecognizer:
    """
    Wraps an AdaFace .onnx model so it can be used exactly like an InsightFace recognizer: calling
    .get(image, face) fills in face.embedding, the same method name and effect that InsightFace's
    own recognizer has. That is what lets FaceModel.find_faces() below work unchanged for both
    InsightFace and AdaFace packs.
    """

    def __init__(self, pack):
        from insightface.utils import face_align
        self.align = face_align.norm_crop  # the same 112x112 face alignment InsightFace's own recognizers use

        onnx_path = (HERE / "models" / "adaface" / ADAFACE_PACKS[pack]["filename"]).with_suffix(".onnx")
        if not onnx_path.exists():
            convert_adaface_to_onnx(pack, download_adaface_checkpoint(pack), onnx_path)
        self.model_file = str(onnx_path)  # so FaceModel can read its size, same as InsightFace's .onnx files

        self.session = onnxruntime.InferenceSession(str(onnx_path), providers=["CPUExecutionProvider"])
        self.input_name = self.session.get_inputs()[0].name
        self.output_name = self.session.get_outputs()[0].name

    def get(self, image, face):
        """Align the face to 112x112, run AdaFace, and store the embedding on `face` (like InsightFace does)."""
        aligned = self.align(image, landmark=face.kps, image_size=112)
        # AdaFace expects BGR pixels scaled to roughly [-1, 1]; cv2 images are already BGR
        pixels = (aligned.astype(np.float32) / 255.0 - 0.5) / 0.5
        tensor = pixels.transpose(2, 0, 1)[np.newaxis]  # HxWxC -> 1xCxHxW
        embedding = self.session.run([self.output_name], {self.input_name: tensor})[0][0]
        face.embedding = embedding  # face.normed_embedding is computed from this automatically


class FaceModel:
    """One pack = a detector (finds faces) + a recognizer (turns a face into 512 numbers)."""

    def __init__(self, pack, det_size, det_thresh, detector_pack="buffalo_l"):
        self.pack, self.det_size = pack, det_size
        is_adaface = pack in ADAFACE_PACKS

        # detection always comes from an InsightFace SCRFD pack, even for adaface_* packs (see the
        # module docstring for why); when the pack IS an InsightFace pack, it supplies both detector
        # and recognizer, so we do not need to load a second copy of it.
        detector_source = detector_pack if is_adaface else pack
        modules = ("detection",) if is_adaface else ("detection", "recognition")
        try:
            app = load_pack(detector_source, modules)
        except AssertionError:  # the .onnx files were not found yet (e.g. just downloaded) - try once more
            app = load_pack(detector_source, modules)
        app.prepare(ctx_id=-1, det_thresh=det_thresh, det_size=det_size)  # ctx_id=-1 means "use the CPU"
        self.detector = app.det_model
        self.recognizer = AdaFaceRecognizer(pack) if is_adaface else app.models["recognition"]

        self.det_name = Path(self.detector.model_file).stem                    # e.g. det_10g
        self.rec_name = pack if is_adaface else Path(self.recognizer.model_file).stem  # e.g. w600k_mbf
        self.model_mb = (Path(self.detector.model_file).stat().st_size +
                         Path(self.recognizer.model_file).stat().st_size) / 1e6
        self.warmed_up = False  # the first run of a model is slow, so we do one untimed run first

    def find_faces(self, image, det_size=None):
        """Detect faces and compute each face's embedding. Returns (faces, detect_ms, recognize_ms)."""
        start = time.perf_counter()
        boxes, landmarks = self.detector.detect(image, input_size=det_size or self.det_size,
                                                max_num=0, metric="default")
        detect_done = time.perf_counter()

        faces = []
        for i in range(len(boxes)):
            face = Face(bbox=boxes[i, :4], kps=landmarks[i], det_score=boxes[i, 4])
            self.recognizer.get(image, face)  # computes the embedding and stores it inside `face`
            faces.append(face)
        end = time.perf_counter()
        return faces, (detect_done - start) * 1000, (end - detect_done) * 1000


# ------------------------------------------------------------------ gallery
def build_gallery(model, gallery_dir):
    """
    Return (embeddings, names) with one row per gallery photo, or (None, None) if there is no gallery.
    Results are cached per pack; the cache is rebuilt automatically when the gallery photos change.
    """
    gallery_dir = Path(gallery_dir)
    student_dirs = sorted(d for d in gallery_dir.iterdir() if d.is_dir()) if gallery_dir.is_dir() else []
    photos = [(d.name, p) for d in student_dirs for p in sorted(d.iterdir()) if p.suffix.lower() in IMAGE_TYPES]
    if not photos:
        return None, None

    # A "fingerprint" of the gallery (names, sizes, dates) tells us if the cache is still valid
    fingerprint = str([(name, p.name, p.stat().st_size, int(p.stat().st_mtime)) for name, p in photos])
    cache_file = HERE / "cache" / f"gallery_{model.pack}.npz"
    if cache_file.exists():
        saved = np.load(cache_file)
        if str(saved["fingerprint"]) == fingerprint:
            print(f"  gallery: loaded {len(saved['names'])} embeddings from cache")
            return saved["embeddings"], list(saved["names"])

    print(f"  gallery: computing embeddings with {model.pack} ...")
    embeddings, names = [], []
    for name, photo in photos:
        faces, _, _ = model.find_faces(load_image(photo), det_size=GALLERY_DET_SIZE)
        if not faces:
            print(f"    ! no face found in {name}/{photo.name}")
            continue
        if len(faces) > 1:
            print(f"    ! {len(faces)} faces in {name}/{photo.name}, using the largest")
        biggest = max(faces, key=lambda f: np.prod(face_size(f)))
        embeddings.append(biggest.normed_embedding)  # "normed" = scaled to length 1, so dot product = similarity
        names.append(name)

    if not embeddings:
        return None, None
    embeddings = np.stack(embeddings)  # list of 512-number arrays -> one 2D array (photos x 512)
    cache_file.parent.mkdir(exist_ok=True)
    np.savez(cache_file, embeddings=embeddings, names=np.array(names), fingerprint=np.array(fingerprint))
    return embeddings, names


# ----------------------------------------------------------------- matching
def match_faces(faces, gallery_embeddings, gallery_names, match_threshold, borderline_margin, min_face_px):
    """
    Decide who each detected face is. Returns one dict per face: {"name", "score", "status"}.
    status: match / borderline / unknown / small, or "detected" when there is no gallery to compare with.
    A student is given to at most one face (the face with the best score).
    """
    if gallery_embeddings is None:
        return [{"name": None, "score": float(f.det_score), "status": "detected"} for f in faces]
    if not faces:
        return []

    # Similarity of every face to every gallery photo (1 = identical, 0 = unrelated)
    face_embeddings = np.stack([f.normed_embedding for f in faces])
    photo_scores = face_embeddings @ gallery_embeddings.T  # "@" is matrix multiplication (dot products)

    # A student's score for a face = the best score among that student's photos
    student_names = sorted(set(gallery_names))
    names_per_photo = np.array(gallery_names)
    scores = np.stack([photo_scores[:, names_per_photo == name].max(axis=1) for name in student_names], axis=1)

    # Start with everyone as "unknown" (or "small" for tiny faces); then hand out names below
    too_small = np.array([min(face_size(f)) < min_face_px for f in faces])
    results = [{"name": None, "score": float(scores[i].max()), "status": "small" if too_small[i] else "unknown"}
               for i in range(len(faces))]

    # Go through (face, student) pairs from best score to worst; each face and each student is used only once
    assignable = scores.copy()
    assignable[too_small] = -np.inf  # tiny faces are not allowed to claim a name
    used_faces, used_students = set(), set()
    for flat_index in np.argsort(-assignable, axis=None):
        face_i, student_i = divmod(int(flat_index), len(student_names))  # flat position -> (row, column)
        score = assignable[face_i, student_i]
        if score < match_threshold - borderline_margin:
            break  # every remaining pair is worse than this, so we are done
        if face_i in used_faces or student_i in used_students:
            continue
        used_faces.add(face_i)
        used_students.add(student_i)
        results[face_i] = {"name": student_names[student_i], "score": float(score),
                           "status": "match" if score >= match_threshold else "borderline"}
    return results


# --------------------------------------------------------------- annotation
def label_text(result):
    """The text written above each box."""
    status, score = result["status"], result["score"]
    if status == "match":
        return f"{result['name']} {score:.3f}"
    if status == "borderline":
        return f"{result['name']}? {score:.3f}"
    if status == "detected":
        return f"face {score:.3f}"
    return f"{status} {score:.3f}"  # "unknown 0.21" or "small 0.30"


def annotate(image, faces, results):
    """Return a copy of the image with a coloured box and a label on every face."""
    canvas = image.copy()
    image_height, image_width = canvas.shape[:2]
    scale = max(0.6, image_height / 900)  # bigger images get bigger text and thicker lines
    box_thickness = max(2, round(2 * scale))
    font_size, text_thickness = max(0.4, 0.5 * scale), max(1, round(1.2 * scale))

    for face, result in zip(faces, results):
        x1, y1, x2, y2 = (int(v) for v in face.bbox)
        color = COLORS[result["status"]]
        cv2.rectangle(canvas, (x1, y1), (x2, y2), color, box_thickness)

        text = label_text(result)
        (text_w, text_h), baseline = cv2.getTextSize(text, FONT, font_size, text_thickness)
        label_x = min(max(0, x1), max(0, image_width - text_w - 4))  # keep the label inside the image
        label_y = y1 - 4 if y1 - text_h - baseline - 6 > 0 else y2 + text_h + 6  # above the box, else below it
        cv2.rectangle(canvas, (label_x, label_y - text_h - baseline - 2), (label_x + text_w + 4, label_y + baseline),
                      color, -1)  # -1 = filled background for the label
        cv2.putText(canvas, text, (label_x + 2, label_y - 1), FONT, font_size, (255, 255, 255),
                    text_thickness, cv2.LINE_AA)
    return canvas


def add_info_header(image, lines, legend):
    """Stack a dark info strip ABOVE the image (so it never hides a face). `legend` = [(text, color), ...]."""
    scale = max(0.6, image.shape[0] / 900)
    font_size, thickness = 0.55 * scale, max(1, round(1.2 * scale))
    padding, line_height = int(10 * scale), int(28 * scale)
    swatch = int(12 * scale)  # side of the small coloured legend square

    header = np.full((2 * padding + line_height * (len(lines) + 1), image.shape[1], 3), 30, np.uint8)
    for row, text in enumerate(lines):
        baseline_y = padding + (row + 1) * line_height - int(line_height * 0.25)
        cv2.putText(header, text, (padding, baseline_y), FONT, font_size, (255, 255, 255), thickness, cv2.LINE_AA)

    x = padding
    y = padding + len(lines) * line_height  # the legend goes on the last row
    for text, color in legend:
        cv2.rectangle(header, (x, y + int(line_height * 0.2)), (x + swatch, y + int(line_height * 0.2) + swatch),
                      color, -1)
        x += swatch + 6
        cv2.putText(header, text, (x, y + line_height - int(line_height * 0.25)), FONT, font_size,
                    (255, 255, 255), thickness, cv2.LINE_AA)
        x += cv2.getTextSize(text, FONT, font_size, thickness)[0][0] + int(14 * scale)
    return np.vstack([header, image])


# ---------------------------------------------------------------------- main
def process_image(model, image_path, gallery, args, out_dir):
    """Run one pack on one image, save the annotated picture, and return one row for timings.csv."""
    gallery_embeddings, gallery_names = gallery
    image = load_image(image_path)
    height, width = image.shape[:2]

    if not model.warmed_up:  # untimed first run (see FaceModel)
        model.find_faces(image)
        model.warmed_up = True

    # Time detection and recognition separately; average over --runs runs to smooth out CPU noise
    detect_times, recognize_times = [], []
    for _ in range(args.runs):
        faces, detect_ms, recognize_ms = model.find_faces(image)
        detect_times.append(detect_ms)
        recognize_times.append(recognize_ms)
    detect_ms, recognize_ms = float(np.mean(detect_times)), float(np.mean(recognize_times))
    total_ms = detect_ms + recognize_ms

    results = match_faces(faces, gallery_embeddings, gallery_names, args.threshold, args.margin, args.min_face)
    counts = {status: sum(r["status"] == status for r in results)
              for status in ("match", "borderline", "unknown", "small")}
    recognized = sorted(r["name"] for r in results if r["status"] == "match")

    # Build the info strip and save the annotated image
    det_w, det_h = model.det_size
    lines = [f"Pack: {model.pack}  ({model.det_name} + {model.rec_name})",
             f"det_size: {det_w}x{det_h}   provider: CPU   image: {width}x{height}",
             f"Detect {detect_ms:.0f} ms | Recog {recognize_ms:.0f} ms | Total {total_ms:.0f} ms"
             f"   (mean of {args.runs} runs)"]
    if gallery_embeddings is None:
        lines.append(f"Faces: {len(faces)}  (no gallery found - detection only)")
        legend = [("detected", COLORS["detected"])]
    else:
        lines.append(f"Faces: {len(faces)} | match {counts['match']} | borderline {counts['borderline']} | "
                     f"unknown {counts['unknown']} | small {counts['small']}")
        legend = [(status, COLORS[status]) for status in ("match", "borderline", "unknown", "small")]
    lines.append(f"threshold {args.threshold:.2f} (borderline band {args.margin:.2f}) | min face {args.min_face}px")

    annotated = add_info_header(annotate(image, faces, results), lines, legend)
    output_path = out_dir / f"{image_path.stem}__{model.pack}.jpg"
    save_image(output_path, annotated)

    # Print a short summary to the screen
    print(f"  {image_path.name}: {len(faces)} faces ({counts['match']} match, {counts['borderline']} borderline, "
          f"{counts['unknown']} unknown, {counts['small']} small) | detect {detect_ms:.0f} ms, "
          f"recognize {recognize_ms:.0f} ms, total {total_ms:.0f} ms -> {output_path.name}")
    if gallery_names:
        not_found = sorted(set(gallery_names) - set(recognized))
        print(f"    present ({len(recognized)}): {', '.join(recognized) or '-'}")
        print(f"    not found ({len(not_found)}): {', '.join(not_found) or '-'}")

    return {"timestamp": datetime.now().isoformat(timespec="seconds"), "image": image_path.name, "pack": model.pack,
            "det_model": model.det_name, "rec_model": model.rec_name, "det_size": f"{det_w}x{det_h}",
            "provider": "CPU", "img_w": width, "img_h": height, "runs": args.runs, "faces": len(faces),
            **counts,  # adds the match / borderline / unknown / small columns
            "det_ms": f"{detect_ms:.1f}", "rec_ms": f"{recognize_ms:.1f}", "total_ms": f"{total_ms:.1f}",
            "threshold": args.threshold, "recognized": ";".join(recognized),
            "image_set": image_path.resolve().parent.name, "det_thresh": args.det_thresh, "min_face": args.min_face,
            "gallery_ids": len(set(gallery_names)) if gallery_names else 0,
            "gallery_imgs": len(gallery_names) if gallery_names else 0,
            "rec_ms_per_face": f"{recognize_ms / len(faces):.1f}" if faces else "",
            "model_mb": f"{model.model_mb:.1f}"}


def parse_args():
    parser = argparse.ArgumentParser(description="Compare InsightFace packs on test / CCTV images (CPU).",
                                     formatter_class=argparse.ArgumentDefaultsHelpFormatter)
    parser.add_argument("--image", required=True, help="an image file, or a folder of images")
    parser.add_argument("--pack", default="buffalo_l", choices=["all", "buffalo_sc"] + PACKS + list(ADAFACE_PACKS),
                        help="model pack, or 'all' for " + ", ".join(PACKS) + " (AdaFace packs: "
                             + ", ".join(ADAFACE_PACKS) + ")")
    parser.add_argument("--detector", default="buffalo_l", choices=PACKS,
                        help="InsightFace pack to use as the face detector for an adaface_* --pack (ignored otherwise)")
    parser.add_argument("--det-size", default="1280x736", help="detector input size, e.g. 640, 1280 or 1280x736")
    parser.add_argument("--det-thresh", type=float, default=0.3, help="minimum detector score (lower = finds tiny faces)")
    parser.add_argument("--threshold", type=float, default=0.30, help="minimum similarity for a match")
    parser.add_argument("--margin", type=float, default=0.08, help="width of the orange 'borderline' band below the threshold")
    parser.add_argument("--min-face", type=int, default=0, help="faces with a shorter side than this (px) are gray")
    parser.add_argument("--runs", type=int, default=1, help="timed runs per image (after one untimed warm-up)")
    parser.add_argument("--gallery", default=str(HERE / "gallery"), help="folder with one sub-folder per student")
    parser.add_argument("--out", default=str(HERE / "outputs"), help="folder for annotated images and timings.csv")
    args = parser.parse_args()
    args.runs = max(1, args.runs)
    return args


def main():
    args = parse_args()
    det_size = parse_det_size(args.det_size)
    images = find_images(args.image)
    if not images:
        sys.exit(f"No images found in {args.image}")
    packs = PACKS if args.pack == "all" else [args.pack]

    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    csv_path = out_dir / "timings.csv"
    prepare_csv(csv_path)

    with open(csv_path, "a", newline="", encoding="utf-8") as csv_file:
        csv_writer = csv.DictWriter(csv_file, fieldnames=CSV_COLUMNS)
        for pack in packs:  # load each pack once, then run it on every image
            print(f"\n=== {pack} ===")
            try:
                model = FaceModel(pack, det_size, args.det_thresh, args.detector)
            except Exception as error:
                print(f"  !! could not load '{pack}': {error}")
                hint = (f"models/adaface/{ADAFACE_PACKS[pack]['filename']}" if pack in ADAFACE_PACKS
                       else f"{HERE / 'models' / pack}/")
                print(f"     If the download failed, put the model file(s) in {hint} by hand.")
                continue

            gallery = build_gallery(model, args.gallery)
            if gallery[0] is None:
                print(f"  (no gallery in {args.gallery} - detection only)")

            for image_path in images:
                csv_writer.writerow(process_image(model, image_path, gallery, args, out_dir))
                csv_file.flush()  # write to disk right away, so nothing is lost if a later image crashes

    print(f"\nAnnotated images saved in: {out_dir}   |   timings: {csv_path}")


if __name__ == "__main__":
    main()
