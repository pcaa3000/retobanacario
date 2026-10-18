"use client";

import { useRef, useState } from "react";

export default function MicButton({
  onAudio,
  deshabilitado,
}: {
  onAudio: (data: string, mimeType: string) => void;
  deshabilitado: boolean;
}) {
  const [grabando, setGrabando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  async function empezar() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType });
        const buffer = await blob.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        let bin = "";
        bytes.forEach((b) => (bin += String.fromCharCode(b)));
        const data = btoa(bin);
        const mime = (recorder.mimeType || "audio/webm").split(";")[0];
        onAudio(data, mime);
      };
      recorder.start();
      recorderRef.current = recorder;
      setGrabando(true);
    } catch {
      setError("No se pudo usar el micrófono");
    }
  }

  function parar() {
    recorderRef.current?.stop();
    recorderRef.current = null;
    setGrabando(false);
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        disabled={deshabilitado}
        onClick={grabando ? parar : empezar}
        title={grabando ? "Parar y enviar" : "Grabar nota de voz"}
        className={`h-12 w-12 rounded-full text-xl text-white shadow transition disabled:opacity-40 ${
          grabando ? "animate-pulse bg-red-600" : "bg-emerald-600 hover:bg-emerald-700"
        }`}
      >
        {grabando ? "■" : "🎙"}
      </button>
      {grabando && <span className="text-sm text-red-600">Grabando… toca para enviar</span>}
      {error && <span className="text-sm text-red-600">{error}</span>}
    </div>
  );
}
