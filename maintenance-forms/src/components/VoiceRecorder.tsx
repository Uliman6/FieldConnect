import { useState, useRef, useCallback } from 'react';

interface VoiceNote {
  id: string;
  audioUrl: string;
  transcription?: string;
  duration: number;
  createdAt: string;
  isTranscribing?: boolean;
}

interface VoiceRecorderProps {
  value: VoiceNote[];
  onChange: (notes: VoiceNote[]) => void;
  onTranscribe?: (audioBlob: Blob) => Promise<string>;
}

export default function VoiceRecorder({ value = [], onChange, onTranscribe }: VoiceRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const startRecording = useCallback(async () => {
    setError(null);
    chunksRef.current = [];

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4',
      });

      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: mediaRecorder.mimeType });
        const audioUrl = URL.createObjectURL(blob);

        // Stop all tracks
        stream.getTracks().forEach(track => track.stop());

        // Clear timer
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }

        // Create new voice note
        const newNote: VoiceNote = {
          id: Date.now().toString(),
          audioUrl,
          duration: recordingDuration,
          createdAt: new Date().toISOString(),
          isTranscribing: !!onTranscribe,
        };

        // Add to notes
        const updatedNotes = [...value, newNote];
        onChange(updatedNotes);

        // Transcribe if handler provided
        if (onTranscribe) {
          try {
            const transcription = await onTranscribe(blob);
            // Update the note with transcription
            const finalNotes = updatedNotes.map(n =>
              n.id === newNote.id
                ? { ...n, transcription, isTranscribing: false }
                : n
            );
            onChange(finalNotes);
          } catch (err) {
            console.error('Transcription failed:', err);
            // Mark as not transcribing
            const finalNotes = updatedNotes.map(n =>
              n.id === newNote.id
                ? { ...n, isTranscribing: false }
                : n
            );
            onChange(finalNotes);
          }
        }

        setRecordingDuration(0);
      };

      mediaRecorder.start(100);
      setIsRecording(true);

      // Start duration timer
      setRecordingDuration(0);
      timerRef.current = window.setInterval(() => {
        setRecordingDuration(d => d + 1);
      }, 1000);

    } catch (err) {
      console.error('Failed to start recording:', err);
      if (err instanceof Error) {
        if (err.name === 'NotAllowedError') {
          setError('Mikrofon erişimi reddedildi. Lütfen izin verin.');
        } else if (err.name === 'NotFoundError') {
          setError('Mikrofon bulunamadı.');
        } else {
          setError('Kayıt başlatılamadı.');
        }
      }
    }
  }, [value, onChange, onTranscribe, recordingDuration]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  }, [isRecording]);

  const deleteNote = useCallback((id: string) => {
    const note = value.find(n => n.id === id);
    if (note?.audioUrl) {
      URL.revokeObjectURL(note.audioUrl);
    }
    onChange(value.filter(n => n.id !== id));
  }, [value, onChange]);

  const updateTranscription = useCallback((id: string, transcription: string) => {
    onChange(value.map(n =>
      n.id === id ? { ...n, transcription } : n
    ));
  }, [value, onChange]);

  return (
    <div className="space-y-3">
      {/* Recording button */}
      <div className="flex items-center justify-center">
        <button
          type="button"
          onClick={isRecording ? stopRecording : startRecording}
          className={`flex items-center gap-2 px-6 py-3 rounded-full font-medium transition-colors ${
            isRecording
              ? 'bg-red-500 text-white animate-pulse'
              : 'bg-green-100 text-green-700 hover:bg-green-200 border-2 border-green-500'
          }`}
        >
          {isRecording ? (
            <>
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <rect x="6" y="6" width="12" height="12" rx="1" />
              </svg>
              <span>{formatDuration(recordingDuration)} - Durdurmak için dokun</span>
            </>
          ) : (
            <>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
              <span>Sesli not kaydet</span>
            </>
          )}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 text-red-600 p-3 rounded-md text-sm flex items-center gap-2">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            className="ml-auto text-red-700 hover:text-red-900"
          >
            Tekrar dene
          </button>
        </div>
      )}

      {/* Voice notes list */}
      {value.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm text-gray-500 font-medium">Kayıtlar ({value.length})</p>
          {value.map((note, idx) => (
            <div key={note.id} className="bg-gray-50 rounded-lg p-3 border border-gray-200">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-700">
                  Kayıt #{idx + 1} ({formatDuration(note.duration)})
                </span>
                <button
                  type="button"
                  onClick={() => deleteNote(note.id)}
                  className="text-red-500 hover:text-red-700"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>

              {/* Audio player */}
              <audio src={note.audioUrl} controls className="w-full h-10 mb-2" />

              {/* Transcription */}
              {note.isTranscribing ? (
                <div className="flex items-center gap-2 text-sm text-blue-600">
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  <span>Transkripsyon yapılıyor...</span>
                </div>
              ) : (
                <div className="mt-2">
                  <textarea
                    value={note.transcription || ''}
                    onChange={(e) => updateTranscription(note.id, e.target.value)}
                    placeholder="Transkripsiyonu buraya yazın veya düzenleyin..."
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {!isRecording && value.length === 0 && (
        <p className="text-center text-sm text-gray-400">
          Kayıt yapmak için mikrofon butonuna dokunun
        </p>
      )}
    </div>
  );
}
