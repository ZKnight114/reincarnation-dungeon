"""Import Maker audio, verify decoding and build an audition page. No generation calls.

python scripts/prepare-exploration-audio.py --deps E:/codex/tools/audio-qa-small
Dependencies: numpy and soundfile. Maker originals are never modified.
"""
import argparse
import hashlib
import html
import json
import math
from pathlib import Path
import shutil
import sys

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--deps", type=Path)
args = parser.parse_args()
if args.deps:
    sys.path.insert(0, str(args.deps.resolve()))
import numpy as np
import soundfile as sf

ROOT = Path(__file__).resolve().parent.parent
ART = ROOT / "art-direction/audio-v16-exploration"
DEST = ROOT / "src/assets/audio"


def result(name):
    raw = json.loads((ART / name).read_text(encoding="utf-8"))
    assert not raw.get("isError"), name
    data = raw.get("structuredContent")
    if data is None:
        data = json.loads(next(x["text"] for x in raw["content"] if x["type"] == "text"))
    assert data.get("success") and not data.get("failed"), name
    return data


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


spec = json.loads((ART / "requests.json").read_text(encoding="utf-8"))
definitions = {row[0]: row for row in spec["definitions"]}
bgm = result("music-result.json")
inputs = [{
    "id": "exploration-bgm", "title": bgm["music"]["title"],
    "category": "背景音乐", "kind": "bgm",
    "usage": "探索历程、装备整理与事件连续播放；战斗时降低音量",
    "originalPath": bgm["music"]["absolutePath"],
    "request": "art-direction/audio-v16-exploration/music-result.json",
    "tool": "text_to_music", "taskId": bgm["taskId"],
    "generatorAssetId": bgm["music"]["id"], "loop": True, "volume": 0.3,
    "loopNote": "整首循环试听；正式接入需交叉淡化，接缝听感尚待验收",
}]
for batch in range(1, 5):
    data = result(f"sfx-batch-{batch}.json")
    for asset in data["audio_files"]:
        key = asset["name"]
        _, title, usage, requested_duration, _ = definitions[key]
        i = list(definitions).index(key)
        category = ("历程" if i < 3 else "装备整理" if i < 8 else
                    "随机事件" if i < 13 else "成长与结算" if i in [20, 22, 23] else "战斗")
        inputs.append({
            "id": key, "title": title, "category": category, "kind": "sfx", "usage": usage,
            "originalPath": asset["absolutePath"],
            "request": f"art-direction/audio-v16-exploration/sfx-batch-{batch}.json",
            "tool": "batch_sound_effects", "loop": key == "explore-wheel-spin",
            "loopNote": "请求为循环轮盘声，接缝听感尚待验收" if key == "explore-wheel-spin" else None,
            "requestedDurationSeconds": requested_duration,
            "providerDurationSeconds": asset["durationSeconds"], "volume": 0.55,
        })
assert len(inputs) == 25 and len({x["id"] for x in inputs}) == 25
entries, warnings = [], []
for item in inputs:
    source = Path(item.pop("originalPath"))
    assert source.is_file() and source.stat().st_size > 0, source
    waveform, sample_rate = sf.read(source, dtype="float32", always_2d=True)
    assert len(waveform) > 0 and np.isfinite(waveform).all(), source
    peak = float(np.max(np.abs(waveform)))
    rms = float(np.sqrt(np.mean(waveform.astype("float64") ** 2)))
    assert rms > 1e-6, f"Silent audio: {source}"
    active = np.flatnonzero(np.max(np.abs(waveform), axis=1) > max(peak * 0.003, 1e-5))
    assert len(active), source
    source_peak = peak
    source_rms = rms
    source_duration = len(waveform) / sample_rate
    gain_db = 0.0
    removed_head = 0.0
    removed_tail = 0.0
    crossfade_seconds = 0.0
    folder = "bgm" if item["kind"] == "bgm" else "sfx"
    extension = ".wav" if item["loop"] and folder == "sfx" else source.suffix.lower()
    filename = ("exploration" if folder == "bgm" else item["id"]) + extension
    target = DEST / folder / filename
    target.parent.mkdir(parents=True, exist_ok=True)
    if folder == "bgm":
        shutil.copy2(source, target)
        assert sha(source) == sha(target), source
    else:
        head_keep = int(sample_rate * 0.01)
        tail_keep = int(sample_rate * (0.01 if item["loop"] else 0.04))
        start = max(0, int(active[0]) - head_keep)
        end = min(len(waveform), int(active[-1]) + 1 + tail_keep)
        removed_head = start / sample_rate
        removed_tail = (len(waveform) - end) / sample_rate
        waveform = waveform[start:end].copy()
        if item["loop"]:
            overlap = min(int(sample_rate * 0.04), len(waveform) // 5)
            ramp = np.linspace(0, 1, overlap, dtype=np.float32)[:, None]
            seam = waveform[-overlap:] * (1 - ramp) + waveform[:overlap] * ramp
            waveform = np.concatenate([waveform[overlap:-overlap], seam])
            crossfade_seconds = overlap / sample_rate
        target_db = -10.0 if item["id"] in {
            "explore-ui-confirm", "explore-journal-ready", "explore-item-pickup",
            "explore-item-place", "explore-reforge-ready",
        } else -7.0
        gain = (10 ** (target_db / 20)) / float(np.max(np.abs(waveform)))
        gain_db = 20 * math.log10(gain)
        waveform *= gain
        if item["loop"]:
            sf.write(target, waveform, sample_rate, format="WAV", subtype="PCM_16")
            previous_copy = target.with_suffix(".mp3")
            if previous_copy.exists() and sha(previous_copy) == sha(source):
                previous_copy.unlink()
        else:
            sf.write(target, waveform, sample_rate, format="MP3", bitrate_mode="VARIABLE", compression_level=0.3)
    waveform, sample_rate = sf.read(target, dtype="float32", always_2d=True)
    assert len(waveform) and np.isfinite(waveform).all(), target
    peak = float(np.max(np.abs(waveform)))
    rms = float(np.sqrt(np.mean(waveform.astype("float64") ** 2)))
    assert rms > 1e-6, target
    clipping = int(np.count_nonzero(np.abs(waveform) >= 1.0))
    active = np.flatnonzero(np.max(np.abs(waveform), axis=1) > max(peak * 0.003, 1e-5))
    entry = {
        **item, "path": target.relative_to(ROOT).as_posix(), "format": target.suffix.lower()[1:],
        "durationSeconds": round(len(waveform) / sample_rate, 5),
        "sampleRate": sample_rate, "channels": waveform.shape[1],
        "bytes": target.stat().st_size, "sha256": sha(target),
        "source": {"provider": "TapTap Maker", "tool": item["tool"],
                   "originalPath": str(source), "sha256": sha(source),
                   "durationSeconds": round(source_duration, 5),
                   "peakDbfs": round(20 * math.log10(source_peak), 3),
                   "rmsDbfs": round(20 * math.log10(source_rms), 3)},
        "processing": {"gainDb": round(gain_db, 3),
                       "removedHeadSilenceSeconds": round(removed_head, 5),
                       "removedTailSilenceSeconds": round(removed_tail, 5),
                       "loopCrossfadeSeconds": round(crossfade_seconds, 5),
                       "originalPreserved": True},
        "validation": {
            "decoded": True, "peakDbfs": round(20 * math.log10(max(peak, 1e-12)), 3),
            "rmsDbfs": round(20 * math.log10(max(rms, 1e-12)), 3),
            "clippingSamples": clipping,
            "leadingSilenceSeconds": round(int(active[0]) / sample_rate, 5),
            "trailingSilenceSeconds": round((len(waveform) - 1 - int(active[-1])) / sample_rate, 5),
            "loopBoundarySampleDelta": round(float(np.max(np.abs(waveform[-1] - waveform[0]))), 6) if item["loop"] and folder == "sfx" else None,
        },
    }
    if clipping:
        warnings.append(f"{entry['id']}: {clipping} decoded samples reach full scale")
    entries.append(entry)

previous_catalogue = json.loads((DEST / "library.json").read_text(encoding="utf-8")) if (DEST / "library.json").exists() else {}
integrated = previous_catalogue.get("runtimeIntegrated") is True
integration_status = "已接入探索播放" if integrated else "尚未接入游戏播放"
catalogue = {
    "schemaVersion": 1, "series": "v16-exploration-20261021", "provider": "TapTap Maker",
    "state": "runtime-integrated" if integrated else "prepared-for-audition",
    "runtimeIntegrated": integrated, "creditsVerified": previous_catalogue.get("creditsVerified", False),
    "policy": "先查音频库并复用；正式资源仅从src/assets读取，禁止运行时依赖Maker工程或样稿目录",
    "processing": "Maker原文件保留。BGM原样复制；音效仅本地裁去首尾多余静音、校准峰值后输出MP3。轮盘40ms首尾交叉混合输出PCM WAV，避免MP3编码空隙。未再次请求生成。",
    "totalBytes": sum(x["bytes"] for x in entries), "entries": entries, "warnings": warnings,
}
(DEST / "library.json").write_text(json.dumps(catalogue, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
(ART / "validation.json").write_text(json.dumps({
    "count": len(entries), "decoded": len(entries), "nonSilent": len(entries),
    "byteIdenticalToMaker": sum(x["sha256"] == x["source"]["sha256"] for x in entries),
    "originalsPreserved": len(entries), "uniqueHashes": len({x["sha256"] for x in entries}),
    "totalBytes": catalogue["totalBytes"], "warnings": warnings,
    "listeningReview": "文件技术核验完成，主观听感与循环接缝尚待试听",
}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

cards = []
for item in entries:
    path = "../../" + item["path"]
    assert (ART / path).resolve().is_file()
    title, usage, category, key = (html.escape(str(item[x]), quote=True) for x in ["title", "usage", "category", "id"])
    cards.append(
        f'<article class="card{" bgm" if item["kind"] == "bgm" else ""}" data-category="{category}">'
        f'<div class="heading"><span>{category}</span><small>{item["durationSeconds"]:.2f} 秒 · {item["bytes"]/1024:.0f} KB</small></div>'
        f'<h2>{title}</h2><p>{usage}</p>'
        f'<audio controls preload="none" data-kind="{item["kind"]}" data-volume="{item["volume"]}"'
        f'{" loop" if item["loop"] else ""} src="{html.escape(path, quote=True)}"></audio>'
        f'<footer><code>{key}</code><a href="{html.escape(path, quote=True)}" download>下载素材</a></footer>'
        f'{"<small>循环试听 · 接缝听感尚待验收</small>" if item["loop"] else ""}</article>'
    )

page = """<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>冒险公会 · 探索音频试听</title>
<style>
:root{color-scheme:dark;font-family:system-ui,"Microsoft YaHei",sans-serif;color:#eee4cb;background:#101c20}
*{box-sizing:border-box}body{margin:0;min-height:100vh;background:radial-gradient(ellipse at top,#223c40,#101c20 70%)}
main{max-width:1120px;margin:auto;padding:30px 20px 50px}header{border-bottom:1px solid #57625a;padding-bottom:20px}
h1{font-size:28px;margin:8px 0 14px}header p{line-height:1.8;color:#c5d2cc;max-width:850px}.eyebrow{color:#e2c58d;font-size:13px;letter-spacing:2px}
nav{display:flex;gap:10px;flex-wrap:wrap;margin:22px 0}button{background:#294248;border:1px solid #66817a;border-radius:8px;color:#eee4cb;padding:10px 16px;cursor:pointer}
button.active{background:#795e33;border-color:#d6bb7c}button:focus-visible,a:focus-visible{outline:2px solid #eed49d;outline-offset:3px}
#stop-all{margin-left:auto;background:#634236}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(285px,1fr));gap:16px}
.card{padding:18px;background:#1b3034;border:1px solid #405953;border-radius:12px;box-shadow:0 4px 14px #0003}
.bgm{grid-column:1/-1;background:linear-gradient(105deg,#344441,#24383c)}.heading{display:flex;align-items:center;justify-content:space-between;gap:8px}
.heading span{font-size:12px;color:#e4cfa3}small{font-size:12px;color:#afc5bd}h2{font-size:19px;margin:12px 0 8px}
.card p{line-height:1.6;color:#c7d4ce;font-size:14px;min-height:44px;margin:0 0 14px}audio{width:100%;height:42px}
footer{display:flex;justify-content:space-between;align-items:center;gap:8px;margin:12px 0 4px}code{font-size:11px;color:#98b5ac;overflow-wrap:anywhere}
a{color:#e4cfa3;font-size:12px;white-space:nowrap}.note{color:#9fb9b0;font-size:13px;line-height:1.7;margin-top:24px}[hidden]{display:none!important}
@media(max-width:600px){main{padding:22px 12px}h1{font-size:23px}nav{gap:7px}button{padding:9px 11px;font-size:13px}#stop-all{margin-left:0}}
</style></head><body><main><header><div class="eyebrow">冒险公会 · V16 · TAPTAP MAKER</div>
<h1>探索背景音乐与音效</h1><p>1 首背景音乐＋24 个短音效，覆盖历程、装备整理、随机事件、探索战斗和成长结算。点击播放器试听，音乐可与一个音效同时播放。同类音效试听自动停止上一条。</p>
<small>共 TOTAL_MB MB · Maker生成＋本地音量校准 · 已核验25个文件可解码且非静音 · 尚未接入游戏播放</small></header>
<nav aria-label="音频分类">FILTERS<button id="stop-all">停止全部</button></nav><section class="grid">CARDS</section>
<p class="note">BGM与轮盘支持循环试听；正式接入时BGM需交叉淡化，轮盘停稳后立即停止。初始音量仅供试听。风格、循环接缝和手机听感尚待试听确认。提示词、Maker结果与核验记录已保留。</p>
<p class="note"><a href="../../src/assets/audio/library.json">资源目录与实际时长</a> · <a href="validation.json">文件核验记录</a></p>
</main><script>
const players=[...document.querySelectorAll('audio')];
players.forEach(player=>{
player.volume=Number(player.dataset.volume);
player.addEventListener('play',()=>{if(player.dataset.kind==='sfx') players.filter(other=>other!==player&&other.dataset.kind==='sfx').forEach(other=>other.pause())});
});
document.querySelector('#stop-all').addEventListener('click',()=>players.forEach(player=>{player.pause();player.currentTime=0}));
document.querySelectorAll('[data-filter]').forEach(button=>button.addEventListener('click',()=>{
document.querySelectorAll('[data-filter]').forEach(other=>other.classList.toggle('active',other===button));
document.querySelectorAll('.card').forEach(card=>{card.hidden=button.dataset.filter!=='全部'&&card.dataset.category!==button.dataset.filter});
}));
</script></body></html>"""
categories = ["全部", "背景音乐", "历程", "装备整理", "随机事件", "战斗", "成长与结算"]
filters = "".join(f'<button data-filter="{name}" class="{"active" if i == 0 else ""}">{name}</button>' for i, name in enumerate(categories))
page = page.replace("FILTERS", filters).replace("CARDS", "\n".join(cards)).replace("TOTAL_MB", f"{catalogue['totalBytes']/1024/1024:.2f}").replace("尚未接入游戏播放", integration_status)
(ART / "探索音频试听.html").write_text(page, encoding="utf-8")
table = ["# 探索音频清单", "", "TapTap Maker生成：1次BGM请求、4次音效批量请求，共25个文件，无重试。",
         f"本批生成、入库和提供试听，{integration_status}；实际积分扣费未核实。", "",
         "| 名称 | 类别 | 实际时长 | 用途 |", "| --- | --- | --- | --- |"]
table.extend(f"| {x['title']} | {x['category']} | {x['durationSeconds']:.2f}s | {x['usage']} |" for x in entries)
table.extend(["", f"交付共 {catalogue['totalBytes']/1024/1024:.2f} MiB。",
              "全部完成解码、非静音与无满幅削波核验；技术核验不代表主观听感已验收。",
              "Maker原文件全部保留。BGM原样复制；音效裁去多余静音并校准峰值，轻提示约-10dBFS，其他音效约-7dBFS；轮盘40ms交叉混合后输出PCM WAV。",
              "正式文件来源和处理数据已登记，轮盘和音乐循环接缝听感尚待试听。",
              "", "资源目录：src/assets/audio/library.json",
              "试听页：art-direction/audio-v16-exploration/探索音频试听.html"])
(ART / "README.md").write_text("\n".join(table) + "\n", encoding="utf-8")
print(json.dumps({"prepared": len(entries), "bgmSeconds": entries[0]["durationSeconds"],
                  "bytes": catalogue["totalBytes"], "warnings": warnings,
                  "clippingSamples": sum(x["validation"]["clippingSamples"] for x in entries)}, ensure_ascii=False))
