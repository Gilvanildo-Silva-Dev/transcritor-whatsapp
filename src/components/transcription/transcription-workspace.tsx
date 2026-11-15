"use client";

import { useEffect, useRef, useState } from "react";
import { languageLabel, normalizeLanguage, type DetectedLanguage } from "@/lib/transcription/language";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";

import { AUDIO_ACCEPT, validateAudioFile, type AudioDetails } from "@/lib/audio/validation";

const actionClass = "inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 transition hover:border-emerald-300 hover:text-emerald-700 dark:hover:text-emerald-300 disabled:opacity-40 disabled:hover:border-slate-200 dark:disabled:hover:border-slate-700 disabled:hover:text-slate-600 dark:disabled:hover:text-slate-400";

function formatSize(bytes: number) {
  return bytes < 1024 * 1024 ? `${(bytes / 1024).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} KB` : `${(bytes / 1024 / 1024).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB`;
}

export function TranscriptionWorkspace({ localMode = true }: { localMode?: boolean }) {
  const [file, setFile] = useState<File | null>(null);
  const [audioUrl, setAudioUrl] = useState("");
  const [dragging, setDragging] = useState(false);
  const [validating, setValidating] = useState(false);
  const [details, setDetails] = useState<AudioDetails | null>(null);
  const [playbackUnavailable, setPlaybackUnavailable] = useState(false);
  const validationId = useRef(0);
  const [error, setError] = useState("");
  const [phase, setPhase] = useState<"idle" | "uploading" | "processing" | "success" | "error">("idle");
  const processing = phase === "uploading" || phase === "processing";
  const [transcriptionError, setTranscriptionError] = useState("");
  const [uploadPercent, setUploadPercent] = useState(0);
  const xhrRef = useRef<XMLHttpRequest | null>(null);
  const transcriptionId = useRef(0);

  const [text, setText] = useState("");
  const [language, setLanguage] = useState<DetectedLanguage | null>(null);
  const [feedback, setFeedback] = useState("");
  const [feedbackError, setFeedbackError] = useState(false);
  const textAreaRef = useRef<HTMLTextAreaElement>(null);
  const copyId = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const dragDepth = useRef(0);

  useEffect(() => () => { if (audioUrl) URL.revokeObjectURL(audioUrl); }, [audioUrl]);
  useEffect(() => () => { validationId.current++; transcriptionId.current++; copyId.current++; xhrRef.current?.abort(); }, []);

  function cancelTranscription() {
    transcriptionId.current++;
    xhrRef.current?.abort();
    xhrRef.current = null;
    setPhase("idle");
    setTranscriptionError("");
    setUploadPercent(0);
  }

  function reset() {
    copyId.current++;
    validationId.current++;
    setValidating(false);
    setDetails(null);
    setPlaybackUnavailable(false);
    cancelTranscription();
    setFile(null);
    setAudioUrl("");

    setError("");
    setText("");
    setLanguage(null);
    setFeedback("");
    if (inputRef.current) inputRef.current.value = "";
  }

  async function selectFiles(files: FileList | File[] | null) {
    if (!files?.length) return;
    const requestId = ++validationId.current;
    cancelTranscription();

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
  async function openAudioPicker() {
    if (!window.transcritorDesktop?.selectAudio) { inputRef.current?.click(); return; }
    try {
      const result = await window.transcritorDesktop.selectAudio();
      if (!result) return;
      if ("error" in result) { setError(result.error); return; }
      await selectFiles([new File([new Uint8Array(result.file.data)], result.file.name)]);
    } catch { setError("Nao foi possivel abrir o seletor de audio. Tente novamente ou arraste o arquivo para a area indicada."); }
  }
  function transcribeAudio() {
    if (!file || processing || validating || xhrRef.current) return;
    copyId.current++;
    const requestId = ++transcriptionId.current;
    const xhr = new XMLHttpRequest();
    xhrRef.current = xhr;
    setPhase("uploading");
    setUploadPercent(0);
    setTranscriptionError("");
    setFeedback("");
    setText("");
    setLanguage(null);
    const isCurrent = () => transcriptionId.current === requestId;
    const fail = (message: string) => {
      if (!isCurrent()) return;
      xhrRef.current = null;
      setPhase("error");
      setTranscriptionError(message);
    };
    try { xhr.open("POST", localMode ? "/api/transcribe/local" : "/api/transcribe"); } catch { fail("Não foi possível iniciar a conexão com o servidor. Tente novamente."); return; }
    xhr.responseType = "json";
    xhr.timeout = localMode ? 900_000 : 300_000;
    xhr.upload.onprogress = (event) => {
      if (isCurrent() && xhrRef.current === xhr && event.lengthComputable) setUploadPercent(Math.round(event.loaded / event.total * 100));
    };
    xhr.upload.onload = () => { if (isCurrent() && xhrRef.current === xhr) setPhase("processing"); };
    xhr.onload = () => {
      if (!isCurrent()) return;
      const response = xhr.response as { text?: unknown; error?: unknown; language?: unknown } | null;
      if (xhr.status < 200 || xhr.status >= 300) {
        fail(typeof response?.error === "string" && response.error.trim() ? response.error : xhr.status === 413 ? "O servidor recusou o tamanho do áudio. Tente um arquivo menor." : "Não foi possível transcrever o áudio. Tente novamente.");
        return;
      }
      if (typeof response?.text !== "string" || !response.text.trim()) { fail("O servidor não retornou uma transcrição válida. Tente outro áudio."); return; }
      xhrRef.current = null;
      setText(response.text);
      setLanguage(normalizeLanguage(response.language));
      setPhase("success");
    };
    xhr.onerror = () => fail("Falha de conexão ao enviar o áudio. Verifique sua conexão e tente novamente.");
    xhr.ontimeout = () => fail("A transcrição excedeu o tempo de espera. Tente um áudio menor.");
    xhr.onabort = () => { if (isCurrent()) { xhrRef.current = null; setPhase("idle"); } };
    const form = new FormData();
    form.append("file", file);
    try { xhr.send(form); } catch { fail("Não foi possível iniciar o envio. Tente selecionar o áudio novamente."); }
  }
  async function copyText() {
    const requestId = ++copyId.current;
    try {
      await navigator.clipboard.writeText(text);
      if (copyId.current !== requestId) return;
      setFeedbackError(false);
      setFeedback("Texto copiado para a área de transferência.");
    } catch {
      if (copyId.current !== requestId) return;
      textAreaRef.current?.focus();
      textAreaRef.current?.select();
      setFeedbackError(true);
      setFeedback("A cópia automática foi bloqueada. O texto foi selecionado; use Ctrl+C ou a opção Copiar do seu dispositivo.");
    }
  }

  function downloadText() {
    let url: string | undefined;
    const link = document.createElement("a");
    try {
      url = URL.createObjectURL(new Blob(["\uFEFF", text], { type: "text/plain;charset=utf-8" }));
      link.href = url;
      const basename = (file?.name.replace(/\.[^.]+$/, "") || "transcricao").replace(/[<>:"/\\|?*]/g, "_").slice(0, 120);
      link.download = `${basename || "transcricao"}.txt`;
      document.body.appendChild(link);
      link.click();
      setFeedbackError(false);
      setFeedback("Download do TXT iniciado.");
    } catch {
      setFeedbackError(true);
      setFeedback("Não foi possível baixar o TXT. Tente novamente ou copie o texto.");
    } finally {
      link.remove();
      if (url) { const release = url; setTimeout(() => URL.revokeObjectURL(release), 1000); }
    }
  }
  return (
    <>
      <div className="mb-6 flex items-start gap-3 rounded-xl border border-emerald-100 dark:border-emerald-900 bg-emerald-50/70 dark:bg-emerald-950/40 px-4 py-3 text-sm leading-6 text-emerald-900 dark:text-emerald-100">
        <Icon name="shield" className="mt-0.5 shrink-0" />
        <p>{localMode ? <><strong className="font-semibold">Transcrição real e gratuita.</strong> O áudio é processado pelo Whisper no computador que executa este aplicativo. Nenhum arquivo é enviado à OpenAI e sua chave não é utilizada.</> : <><strong className="font-semibold">Você decide quando enviar.</strong> Ao clicar em Transcrever áudio, o arquivo será enviado ao servidor e à OpenAI. O aplicativo não armazena áudios permanentemente.</>}</p>
      </div>
      <div className="grid items-start gap-6 lg:grid-cols-2">
        <Card aria-labelledby="audio-title" className="min-w-0 border-slate-200 dark:border-slate-700 shadow-none">
          <div className="mb-6 flex items-center gap-3"><span className="flex size-8 items-center justify-center rounded-full bg-emerald-50 dark:bg-emerald-950/50 text-xs font-bold text-emerald-700 dark:text-emerald-400">01</span><h2 id="audio-title" className="text-lg font-semibold text-slate-900 dark:text-slate-100">Seu áudio</h2></div>
          <input ref={inputRef} id="audio-input" className="sr-only" type="file" accept={AUDIO_ACCEPT} aria-label="Selecionar arquivo de áudio" aria-describedby="audio-help upload-error" aria-invalid={Boolean(error)} onChange={(event) => { void selectFiles(event.target.files); event.target.value = ""; }} />
          <div
            onDragEnter={(event) => { event.preventDefault(); dragDepth.current++; setDragging(true); }}
            onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; }}
            onDragLeave={(event) => { event.preventDefault(); dragDepth.current--; if (dragDepth.current <= 0) { dragDepth.current = 0; setDragging(false); } }}
            onDrop={(event) => { event.preventDefault(); dragDepth.current = 0; setDragging(false); void selectFiles(event.dataTransfer.files); }}
            className={`flex min-h-64 flex-col items-center justify-center rounded-xl border-2 border-dashed px-5 py-8 text-center transition-colors ${dragging ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/50" : "border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-950/60"}`}
          >
            <span className="mb-5 flex size-14 items-center justify-center rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-400 shadow-sm"><Icon name="upload" width="26" height="26" /></span>
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">{dragging ? "Solte seu áudio aqui" : "Arraste e solte seu áudio aqui"}</p>
            <p className="mb-5 mt-2 text-xs text-slate-500 dark:text-slate-400">ou escolha um arquivo no seu dispositivo</p>
            <button type="button" onClick={() => { void openAudioPicker(); }} className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-5 py-2.5 text-sm font-semibold text-slate-700 dark:text-slate-200 shadow-sm transition hover:border-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300">{file ? "Selecionar outro áudio" : "Selecionar arquivo"}</button>
            <p id="audio-help" className="mt-5 text-xs leading-5 text-slate-500 dark:text-slate-400">OGG, OPUS, MP3, M4A, WAV e WEBM · Até 25 MB</p>
          </div>
          {validating && <p role="status" className="mt-4 flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400"><Icon name="loader" className="animate-spin" />Verificando o arquivo no seu dispositivo…</p>}
          {error && <p id="upload-error" role="alert" className="mt-4 rounded-lg bg-red-50 dark:bg-red-950/50 p-3 text-sm text-red-700 dark:text-red-300">{error}</p>}
          {file && <div className="mt-5 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
            <div className="flex items-center gap-3"><span className="rounded-lg bg-emerald-50 dark:bg-emerald-950/50 p-2.5 text-emerald-700 dark:text-emerald-400"><Icon name="file" /></span><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-200" title={file.name}>{file.name}</p><p className="mt-1 break-all text-xs text-slate-500 dark:text-slate-400">{formatSize(file.size)} · {details?.label ?? "Áudio"}</p></div><button type="button" onClick={reset} aria-label="Remover áudio selecionado" className="rounded-lg p-2 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-200"><Icon name="close" /></button></div>
            {details?.note && <p className="mt-3 text-xs leading-5 text-slate-500 dark:text-slate-400">{details.note}</p>}
            {audioUrl && !playbackUnavailable && <audio key={audioUrl} src={audioUrl} controls preload="metadata" className="mt-4 h-10 w-full" aria-label={`Ouvir ${file.name}`} onError={() => setPlaybackUnavailable(true)} />}
            {playbackUnavailable && <p role="status" className="mt-4 rounded-lg bg-amber-50 dark:bg-amber-950/40 p-3 text-sm leading-6 text-amber-800 dark:text-amber-200">Áudio reconhecido, mas este navegador não conseguiu reproduzi-lo. O arquivo continua selecionado. {localMode ? "Mesmo sem prévia, você pode transcrevê-lo com o Whisper local. A decodificação será feita no computador, sem API paga." : "Você ainda pode transcrevê-lo. Quando necessário, a conversão será feita no servidor ao iniciar a transcrição."}</p>}
          </div>}
          <button type="button" onClick={transcribeAudio} disabled={!file || processing || validating} className="mt-6 flex w-full items-center justify-center gap-3 rounded-xl bg-emerald-700 dark:bg-emerald-700 px-5 py-3.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-800 dark:hover:bg-emerald-800 disabled:bg-slate-100 dark:disabled:bg-slate-800 disabled:text-slate-400 dark:disabled:text-slate-500 disabled:shadow-none">{processing ? <><Icon name="loader" className="animate-spin" />{phase === "uploading" ? "Enviando áudio…" : "Transcrevendo áudio…"}</> : <>Transcrever áudio<Icon name="arrow" /></>}</button>
          <div aria-live="polite" className="mt-3 min-h-5 text-center text-xs leading-5 text-slate-500 dark:text-slate-400">{phase === "uploading" ? `Enviando arquivo: ${uploadPercent}%` : phase === "processing" ? (localMode ? "Whisper está processando no computador. Aguarde; o tempo depende do áudio e da CPU." : "Processando o áudio. Isso pode levar alguns instantes.") : localMode ? "Whisper local · gratuito · sem usar a chave da OpenAI" : "Transcrição com IA · envio somente ao clicar no botão"}</div>
        </Card>

        <Card aria-labelledby="result-title" className="min-w-0 border-slate-200 dark:border-slate-700 shadow-none">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-3"><span className="flex size-8 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800 text-xs font-bold text-slate-500 dark:text-slate-400">02</span><h2 id="result-title" className="text-lg font-semibold text-slate-900 dark:text-slate-100">Transcrição</h2></div><span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${processing ? "bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400" : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400"}`}>{phase === "uploading" ? "Enviando" : phase === "processing" ? "Processando" : phase === "success" ? "Concluída" : phase === "error" ? "Erro" : text.trim() ? "Texto manual" : "Aguardando"}</span></div>
          {language && <section aria-label="Idioma do áudio" className="mb-5 rounded-xl border border-emerald-100 bg-emerald-50/70 p-4 dark:border-emerald-900 dark:bg-emerald-950/40">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div><p className="text-xs font-medium text-slate-500 dark:text-slate-400">Idioma detectado</p><p className="mt-1 font-semibold text-emerald-900 dark:text-emerald-100">{languageLabel(language.code)}</p></div>
              <div className="text-right"><p className="text-xs text-slate-500 dark:text-slate-400">Confiança estimada do idioma</p><p className="mt-1 font-semibold text-emerald-900 dark:text-emerald-100">{language.confidence === null ? "Não informada" : new Intl.NumberFormat("pt-BR", { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(language.confidence)}</p></div>
            </div>
            <p className="mt-3 text-xs leading-5 text-slate-500 dark:text-slate-400">Estimativa do modelo para o idioma do áudio; não é garantia de acerto nem uma medida da precisão do texto.</p>
          </section>}
          <div className="relative" aria-busy={processing}>
            <label htmlFor="transcription" className="mb-2 block text-xs font-medium text-slate-500 dark:text-slate-400">Texto da transcrição · editável</label>
            <textarea ref={textAreaRef} id="transcription" value={text} onChange={(event) => { copyId.current++; setText(event.target.value); setFeedback(""); }} disabled={processing} placeholder={localMode ? "Sua transcrição local aparecerá aqui. Você pode editar, copiar ou baixar o texto em TXT." : "Sua transcrição aparecerá aqui. Depois, você pode revisar o texto, copiá-lo ou baixar um arquivo TXT."} className="min-h-80 w-full resize-y rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-950/50 p-5 text-sm leading-7 text-slate-700 dark:text-slate-200 placeholder:text-slate-500 dark:placeholder:text-slate-400 disabled:opacity-50" />
            {processing && <div className="absolute inset-x-0 bottom-0 top-6 flex flex-col items-center justify-center gap-3 rounded-xl bg-white/95 dark:bg-slate-900/95"><Icon name="loader" width="30" height="30" className="animate-spin text-emerald-600" /><p className="text-sm font-medium text-slate-600 dark:text-slate-300">{phase === "uploading" ? "Enviando seu áudio…" : "Transformando fala em texto…"}</p><p className="text-xs text-slate-500 dark:text-slate-400">Aguarde a conclusão da transcrição</p></div>}
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3"><span className="text-xs text-slate-500 dark:text-slate-400">{text.length.toLocaleString("pt-BR")} caracteres</span><div className="flex gap-2"><button type="button" onClick={copyText} disabled={!text.trim() || processing} className={actionClass}><Icon name="copy" width="15" height="15" />Copiar texto</button><button type="button" onClick={downloadText} disabled={!text.trim() || processing} className={actionClass}><Icon name="download" width="15" height="15" />Baixar TXT</button></div></div>
          {transcriptionError && <p role="alert" id="transcription-error" className="mt-5 rounded-lg bg-red-50 dark:bg-red-950/50 p-3 text-sm leading-6 text-red-700 dark:text-red-300">{transcriptionError}</p>}
          <div aria-live="polite" role="status" className="mt-5 text-sm leading-6">
            {phase === "success" && <p className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400"><Icon name="check" />Transcrição concluída. Você pode revisar e editar o texto.</p>}
            {feedback && <p className={`mt-2 ${feedbackError ? "text-amber-800 dark:text-amber-200" : "text-emerald-700 dark:text-emerald-400"}`}>{feedback}</p>}
          </div>
        </Card>
      </div>
      <p className="mt-6 flex items-center justify-center gap-2 text-xs text-slate-500 dark:text-slate-400"><Icon name="shield" width="15" height="15" />{localMode ? "Whisper local · Sem envio à OpenAI · Sem consumo de API" : "Envio apenas ao transcrever · Sem armazenamento permanente no aplicativo"}</p>
    </>
  );
}








