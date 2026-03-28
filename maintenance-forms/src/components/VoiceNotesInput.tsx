import { useState, useRef, useCallback } from 'react';
import { api } from '../lib/api';

interface VoiceRecording {
  id: string;
  audioUrl: string;
  rawTranscription?: string;
  duration: number;
  createdAt: string;
  isTranscribing?: boolean;
}

interface VoiceNotesInputProps {
  /** The cleaned/edited notes text that gets saved */
  value: string;
  onChange: (text: string) => void;
  /** Raw recordings are stored separately for reference */
  recordings?: VoiceRecording[];
  onRecordingsChange?: (recordings: VoiceRecording[]) => void;
  placeholder?: string;
}

export default function VoiceNotesInput({
  value,
  onChange,
  recordings = [],
  onRecordingsChange,
  placeholder = 'Sesli kayit yapin veya buraya yazin...',
}: VoiceNotesInputProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isCleaningUp, setIsCleaningUp] = useState(false);
  const [showRawTranscriptions, setShowRawTranscriptions] = useState(false);

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

        // Create new recording
        const newRecording: VoiceRecording = {
          id: Date.now().toString(),
          audioUrl,
          duration: recordingDuration,
          createdAt: new Date().toISOString(),
          isTranscribing: true,
        };

        // Add to recordings
        const updatedRecordings = [...recordings, newRecording];
        onRecordingsChange?.(updatedRecordings);

        // Transcribe
        try {
          const result = await api.transcribeAudio(blob);
          if (result.success && result.text) {
            // Update the recording with transcription
            const finalRecordings = updatedRecordings.map(r =>
              r.id === newRecording.id
                ? { ...r, rawTranscription: result.text, isTranscribing: false }
                : r
            );
            onRecordingsChange?.(finalRecordings);

            // Auto-append to notes if no cleanup has been done yet
            // Only auto-append raw transcription, user can clean up later
            if (!value.trim()) {
              onChange(result.text || '');
            } else {
              // Append new transcription to existing notes
              onChange(value + '\n\n' + (result.text || ''));
            }
          } else {
            const finalRecordings = updatedRecordings.map(r =>
              r.id === newRecording.id ? { ...r, isTranscribing: false } : r
            );
            onRecordingsChange?.(finalRecordings);
          }
        } catch (err) {
          console.error('Transcription failed:', err);
          const finalRecordings = updatedRecordings.map(r =>
            r.id === newRecording.id ? { ...r, isTranscribing: false } : r
          );
          onRecordingsChange?.(finalRecordings);
          setError('Transkripsiyon basarisiz oldu. Lutfen tekrar deneyin.');
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
          setError('Mikrofon erisimi reddedildi. Lutfen izin verin.');
        } else if (err.name === 'NotFoundError') {
          setError('Mikrofon bulunamadi.');
        } else {
          setError('Kayit baslatilamadi.');
        }
      }
    }
  }, [recordings, onRecordingsChange, recordingDuration, value, onChange]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  }, [isRecording]);

  const deleteRecording = useCallback((id: string) => {
    const recording = recordings.find(r => r.id === id);
    if (recording?.audioUrl) {
      URL.revokeObjectURL(recording.audioUrl);
    }
    onRecordingsChange?.(recordings.filter(r => r.id !== id));
  }, [recordings, onRecordingsChange]);

  const handleCleanup = useCallback(async () => {
    if (!value.trim()) {
      setError('Temizlenecek not yok.');
      return;
    }

    setIsCleaningUp(true);
    setError(null);

    try {
      const result = await api.cleanupNotes(value);
      if (result.success && result.cleanedText) {
        onChange(result.cleanedText);
      }
    } catch (err) {
      console.error('Cleanup failed:', err);
      setError('Notlari temizleme basarisiz oldu.');
    } finally {
      setIsCleaningUp(false);
    }
  }, [value, onChange]);

  // Check if any recording is transcribing
  const isTranscribing = recordings.some(r => r.isTranscribing);

  return (
    <div className="space-y-4">
      {/* Main Recording Button - PROMINENT */}
      <div className="flex flex-col items-center gap-3 p-4 bg-gradient-to-b from-gray-50 to-white rounded-xl border-2 border-dashed border-gray-300">
        <button
          type="button"
          onClick={isRecording ? stopRecording : startRecording}
          disabled={isTranscribing}
          className={`flex items-center justify-center gap-3 px-8 py-4 rounded-full font-semibold text-lg transition-all shadow-lg ${
            isRecording
              ? 'bg-red-500 text-white animate-pulse scale-105'
              : 'bg-blue-600 text-white hover:bg-blue-700 hover:scale-105'
          } disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          {isRecording ? (
            <>
              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                <rect x="6" y="6" width="12" height="12" rx="2" />
              </svg>
              <span>{formatDuration(recordingDuration)} - Durdurmak icin dokun</span>
            </>
          ) : (
            <>
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
              <span>Sesli Kayit Baslat</span>
            </>
          )}
        </button>

        {!isRecording && (
          <p className="text-sm text-gray-500 text-center">
            Konusun, otomatik olarak yaziya cevrilecek
          </p>
        )}

        {isTranscribing && (
          <div className="flex items-center gap-2 text-blue-600">
            <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            <span className="font-medium">Yaziya cevriliyor...</span>
          </div>
        )}
      </div>

      {error && (
        <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm flex items-center gap-2">
          <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            className="ml-auto text-red-700 hover:text-red-900 font-medium"
          >
            Kapat
          </button>
        </div>
      )}

      {/* Notes Text Area - The main editable output */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="block text-sm font-semibold text-gray-700">
            Servis Notu
          </label>
          {value.trim() && (
            <button
              type="button"
              onClick={handleCleanup}
              disabled={isCleaningUp}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-purple-700 bg-purple-50 rounded-lg hover:bg-purple-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isCleaningUp ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  <span>Duzenleniyor...</span>
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                  <span>AI ile Duzenle</span>
                </>
              )}
            </button>
          )}
        </div>
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={6}
          className="w-full px-4 py-3 border border-gray-300 rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
        />
        <p className="text-xs text-gray-400">
          Sesli kayit otomatik olarak buraya yazilir. Duzenleyebilir veya dogrudan yazabilirsiniz.
        </p>
      </div>

      {/* Recordings List - Collapsed by default */}
      {recordings.length > 0 && (
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <button
            type="button"
            onClick={() => setShowRawTranscriptions(!showRawTranscriptions)}
            className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors"
          >
            <span className="text-sm font-medium text-gray-700">
              Kayitlar ({recordings.length})
            </span>
            <svg
              className={`w-5 h-5 text-gray-500 transition-transform ${showRawTranscriptions ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {showRawTranscriptions && (
            <div className="p-3 space-y-2 bg-white">
              {recordings.map((recording, idx) => (
                <div key={recording.id} className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-600">
                      Kayit #{idx + 1} ({formatDuration(recording.duration)})
                    </span>
                    <button
                      type="button"
                      onClick={() => deleteRecording(recording.id)}
                      className="text-red-500 hover:text-red-700 p-1"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>

                  <audio src={recording.audioUrl} controls className="w-full h-8 mb-2" />

                  {recording.isTranscribing ? (
                    <div className="flex items-center gap-2 text-sm text-blue-600">
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      <span>Transkripsiyon yapiliyor...</span>
                    </div>
                  ) : recording.rawTranscription ? (
                    <p className="text-sm text-gray-600 bg-white p-2 rounded border border-gray-100">
                      {recording.rawTranscription}
                    </p>
                  ) : (
                    <p className="text-sm text-gray-400 italic">Transkripsiyon yok</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
