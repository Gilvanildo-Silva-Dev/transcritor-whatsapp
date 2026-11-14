"use client";

import { useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";

import { AUDIO_ACCEPT, validateAudioFile, type AudioDetails } from "@/lib/audio/validation";

const actionClass = "inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 transition hover:border-emerald-300 hover:text-emerald-700 disabled:opacity-40 disabled:hover:border-slate-200 disabled:hover:text-slate-600";

function formatSize(bytes: number) {
  return bytes < 1024 * 1024 ? `${(bytes / 1024).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} KB` : `${(bytes / 1024 / 1024).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB`;
}

export function TranscriptionWorkspace() {
  const [file, setFile] = useState<File | null>(null);
  const [audioUrl, setAudioUrl] = useState("");
  const [dragging, setDragging] = useState(false);
  const [validating, setValidating] = useState(false);
  const [details, setDetails] = useState<AudioDetails | null>(null);
  const [playbackUnavailable, setPlaybackUnavailable] = useState(false);
  const validationId = useRef(0);
  const [error, setError] = useState("");
  const [processing, setProcessing] = useState(false);
  const [previewDone, setPreviewDone] = useState(false);
  const [text, setText] = useState("");
  const [feedback, setFeedback] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragDepth = useRef(0);

  useEffect(() => () => { if (audioUrl) URL.revokeObjectURL(audioUrl); }, [audioUrl]);
  useEffect(() => () => { validationId.current++; if (timerRef.current) clearTimeout(timerRef.current); }, []);

  function reset() {
    validationId.current++;
    setValidating(false);
    setDetails(null);
    setPlaybackUnavailable(false);
    if (timerRef.current) clearTimeout(timerRef.current);
    setFile(null);
    setAudioUrl("");
    setProcessing(false);
    setPreviewDone(false);
    setError("");
    setText("");
    setFeedback("");
    if (inputRef.current) inputRef.current.value = "";
  }

  async function selectFiles(files: FileList | null) {
    if (!files?.length) return;
    const requestId = ++validationId.current;
    if (timerRef.current) clearTimeout(timerRef.current);
    setProcessing(false);
    setPreviewDone(false);
    setError("");
    if (files.length !== 1) {
      setValidating(false);
      setError("Selecione apenas um áudio por vez. O arquivo anterior, se houver, foi mantido.");
      return;
    }
    const selected = files[0];
    setValidating(true);
    const result = await validateAudioFile(selected);
    if (validationId.current !== requestId) return;
    setValidating(false);
    if (!result.ok) {
      setError(result.error + (file ? " O áudio anterior foi mantido." : ""));
      return;
    }
    reset();
    setFile(selected);
    setDetails(result.details);
    const canPlay = document.createElement("audio").canPlayType(result.details.mime) !== "";
    setPlaybackUnavailable(!canPlay);
    if (canPlay) setAudioUrl(URL.createObjectURL(new Blob([selected], { type: result.details.mime.split(";")[0] })));
  }
  function simulateProcessing() {
    if (!file || processing || validating) return;
    setProcessing(true);
    setPreviewDone(false);
    setFeedback("");
    timerRef.current = setTimeout(() => {
      setProcessing(false);
      setPreviewDone(true);
      timerRef.current = null;
    }, 1800);
  }

  async function copyText() {
    try {
      await navigator.clipboard.writeText(text);
      setFeedback("Texto copiado para a área de transferência.");
    } catch {
      setFeedback("Não foi possível copiar automaticamente. Selecione o texto e use a opção de copiar do seu dispositivo.");
    }
  }

  function downloadText() {
    const url = URL.createObjectURL(new Blob(["\uFEFF", text], { type: "text/plain;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${file?.name.replace(/\.[^.]+$/, "") || "transcricao"}.txt`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setFeedback("Download do TXT iniciado.");
  }

  return (
    <>
      <div className="mb-6 flex items-start gap-3 rounded-xl border border-emerald-100 bg-emerald-50/70 px-4 py-3 text-sm leading-6 text-emerald-900">
        <Icon name="shield" className="mt-0.5 shrink-0" />
        <p><strong className="font-semibold">Seu áudio fica no seu dispositivo.</strong> Esta prévia usa apenas interações locais. A transcrição com IA será conectada em uma próxima etapa.</p>
      </div>
      <div className="grid items-start gap-6 lg:grid-cols-2">
        <Card aria-labelledby="audio-title" className="min-w-0 border-slate-200 shadow-none">
          <div className="mb-6 flex items-center gap-3"><span className="flex size-8 items-center justify-center rounded-full bg-emerald-50 text-xs font-bold text-emerald-700">01</span><h2 id="audio-title" className="text-lg font-semibold text-slate-900">Seu áudio</h2></div>
          <input ref={inputRef} id="audio-input" className="sr-only" type="file" accept={AUDIO_ACCEPT} aria-label="Selecionar arquivo de áudio" aria-describedby="audio-help upload-error" aria-invalid={Boolean(error)} onChange={(event) => { void selectFiles(event.target.files); event.target.value = ""; }} />
          <div
            onDragEnter={(event) => { event.preventDefault(); dragDepth.current++; setDragging(true); }}
            onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; }}
            onDragLeave={(event) => { event.preventDefault(); dragDepth.current--; if (dragDepth.current <= 0) { dragDepth.current = 0; setDragging(false); } }}
            onDrop={(event) => { event.preventDefault(); dragDepth.current = 0; setDragging(false); void selectFiles(event.dataTransfer.files); }}
            className={`flex min-h-64 flex-col items-center justify-center rounded-xl border-2 border-dashed px-5 py-8 text-center transition-colors ${dragging ? "border-emerald-500 bg-emerald-50" : "border-slate-200 bg-slate-50/70"}`}
          >
            <span className="mb-5 flex size-14 items-center justify-center rounded-2xl border border-slate-200 bg-white text-emerald-700 shadow-sm"><Icon name="upload" width="26" height="26" /></span>
            <p className="text-sm font-semibold text-slate-800">{dragging ? "Solte seu áudio aqui" : "Arraste e solte seu áudio aqui"}</p>
            <p className="mb-5 mt-2 text-xs text-slate-400">ou escolha um arquivo no seu dispositivo</p>
            <button type="button" onClick={() => inputRef.current?.click()} className="rounded-lg border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-emerald-400 hover:text-emerald-700">{file ? "Selecionar outro áudio" : "Selecionar arquivo"}</button>
            <p id="audio-help" className="mt-5 text-xs leading-5 text-slate-400">OGG, OPUS, MP3, M4A, WAV e WEBM · Até 25 MB</p>
          </div>
          {validating && <p role="status" className="mt-4 flex items-center gap-2 text-sm text-emerald-700"><Icon name="loader" className="animate-spin" />Verificando o arquivo no seu dispositivo…</p>}
          {error && <p id="upload-error" role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          {file && <div className="mt-5 rounded-xl border border-slate-200 p-4">
            <div className="flex items-center gap-3"><span className="rounded-lg bg-emerald-50 p-2.5 text-emerald-700"><Icon name="file" /></span><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-slate-800" title={file.name}>{file.name}</p><p className="mt-1 break-all text-xs text-slate-500">{formatSize(file.size)} · {details?.label ?? "Áudio"}</p></div><button type="button" onClick={reset} aria-label="Remover áudio selecionado" className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><Icon name="close" /></button></div>
            {details?.note && <p className="mt-3 text-xs leading-5 text-slate-500">{details.note}</p>}
            {audioUrl && !playbackUnavailable && <audio key={audioUrl} src={audioUrl} controls preload="metadata" className="mt-4 h-10 w-full" aria-label={`Ouvir ${file.name}`} onError={() => setPlaybackUnavailable(true)} />}
            {playbackUnavailable && <p role="status" className="mt-4 rounded-lg bg-amber-50 p-3 text-sm leading-6 text-amber-800">Áudio reconhecido, mas este navegador não conseguiu reproduzi-lo. O arquivo continua selecionado. A conversão no servidor será conectada em uma próxima etapa; nenhuma conversão foi executada.</p>}
          </div>}
          <button type="button" onClick={simulateProcessing} disabled={!file || processing || validating} className="mt-6 flex w-full items-center justify-center gap-3 rounded-xl bg-emerald-700 px-5 py-3.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-800 disabled:bg-slate-100 disabled:text-slate-400 disabled:shadow-none">{processing ? <><Icon name="loader" className="animate-spin" />Processando prévia…</> : <>Transcrever áudio<Icon name="arrow" /></>}</button>
          <div aria-live="polite" className="mt-3 min-h-5 text-center text-xs leading-5 text-slate-400">{processing ? "Simulação visual em andamento. Nenhum arquivo está sendo enviado." : "Modo de prévia · a IA ainda não está conectada"}</div>
        </Card>

        <Card aria-labelledby="result-title" className="min-w-0 border-slate-200 shadow-none">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-3"><span className="flex size-8 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-500">02</span><h2 id="result-title" className="text-lg font-semibold text-slate-900">Transcrição</h2></div><span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${processing ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{processing ? "Processando prévia" : text.trim() ? "Texto manual" : "Aguardando"}</span></div>
          <div className="relative" aria-busy={processing}>
            <label htmlFor="transcription" className="mb-2 block text-xs font-medium text-slate-500">Texto da transcrição · editável</label>
            <textarea id="transcription" value={text} onChange={(event) => { setText(event.target.value); setFeedback(""); }} disabled={processing} placeholder="A transcrição aparecerá aqui quando a IA estiver conectada. Você também pode digitar ou colar um texto para testar a cópia e o download." className="min-h-80 w-full resize-y rounded-xl border border-slate-200 bg-slate-50/50 p-5 text-sm leading-7 text-slate-700 placeholder:text-slate-400 disabled:opacity-50" />
            {processing && <div className="absolute inset-x-0 bottom-0 top-6 flex flex-col items-center justify-center gap-3 rounded-xl bg-white/95"><Icon name="loader" width="30" height="30" className="animate-spin text-emerald-600" /><p className="text-sm font-medium text-slate-600">Preparando a interface…</p><p className="text-xs text-slate-400">Simulação local de processamento</p></div>}
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3"><span className="text-xs text-slate-400">{text.length.toLocaleString("pt-BR")} caracteres</span><div className="flex gap-2"><button type="button" onClick={copyText} disabled={!text.trim() || processing} className={actionClass}><Icon name="copy" width="15" height="15" />Copiar texto</button><button type="button" onClick={downloadText} disabled={!text.trim() || processing} className={actionClass}><Icon name="download" width="15" height="15" />Baixar TXT</button></div></div>
          <div aria-live="polite" role="status" className="mt-5 text-sm leading-6">
            {previewDone && <p className="rounded-lg border border-amber-100 bg-amber-50 p-3 text-amber-800">Prévia concluída. A integração com IA ainda não está disponível, por isso nenhum texto foi gerado. Você pode inserir texto manualmente para experimentar as ações.</p>}
            {feedback && <p className="mt-2 text-emerald-700">{feedback}</p>}
          </div>
        </Card>
      </div>
      <p className="mt-6 flex items-center justify-center gap-2 text-xs text-slate-400"><Icon name="shield" width="15" height="15" />Sem envio de arquivos. Sem armazenamento de áudios.</p>
    </>
  );
}


