import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';

type VoiceSession = {
  transcript: string;
  initialTranscript: string;
  finalTranscript: string;
  permitted: boolean;
  started: boolean;
  cancelled: boolean;
  failed: boolean;
};

type VoiceCallbacks = {
  onTranscript: (text: string) => void;
};

export function useVoiceInput(callbacks: VoiceCallbacks) {
  const latest = useRef(callbacks);
  const session = useRef<VoiceSession | null>(null);
  const restartRequested = useRef<string | undefined>(undefined);
  const [status, setStatus] = useState<'idle' | 'requesting' | 'listening' | 'stopping'>('idle');
  const [error, setError] = useState<string>();
  const [needsSettings, setNeedsSettings] = useState(false);

  useEffect(() => { latest.current = callbacks; });

  const begin = useCallback(() => {
    const current = session.current;
    if (!current?.permitted || current.started || current.cancelled || AppState.currentState !== 'active') return;
    try {
      current.started = true;
      ExpoSpeechRecognitionModule.start({
        lang: 'pl-PL',
        interimResults: true,
        continuous: true,
        maxAlternatives: 1,
        iosTaskHint: 'dictation',
      });
    } catch {
      session.current = null;
      setStatus('idle');
      setError('Nie udało się włączyć mikrofonu. Spróbuj ponownie lub wpisz pytanie.');
    }
  }, []);

  const start = useCallback(async (draft = '') => {
    if (session.current) {
      if (session.current.cancelled) restartRequested.current = draft;
      return;
    }
    setError(undefined);
    setNeedsSettings(false);
    if (!ExpoSpeechRecognitionModule.isRecognitionAvailable()) {
      setError('Rozpoznawanie mowy jest niedostępne. Włącz dyktowanie w ustawieniach telefonu lub wpisz pytanie.');
      setNeedsSettings(true);
      return;
    }
    const current: VoiceSession = {
      transcript: draft.trim(), initialTranscript: draft.trim(), finalTranscript: '',
      permitted: false, started: false, cancelled: false, failed: false,
    };
    session.current = current;
    setStatus('requesting');
    try {
      const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (session.current !== current || current.cancelled) return;
      if (!permission.granted) {
        session.current = null;
        setStatus('idle');
        setNeedsSettings(!permission.canAskAgain);
        setError('Zezwól na mikrofon i rozpoznawanie mowy, aby podyktować pytanie. Możesz też pisać.');
        return;
      }
      current.permitted = true;
      latest.current.onTranscript(current.transcript);
      begin();
    } catch {
      if (session.current !== current) return;
      session.current = null;
      setStatus('idle');
      setError('Nie udało się uzyskać dostępu do mikrofonu. Spróbuj ponownie lub wpisz pytanie.');
    }
  }, [begin]);

  const cancel = useCallback(() => {
    restartRequested.current = undefined;
    const current = session.current;
    if (!current || current.cancelled) return;
    current.cancelled = true;
    if (current.started) {
      setStatus('stopping');
      ExpoSpeechRecognitionModule.abort();
    } else {
      session.current = null;
      setStatus('idle');
    }
  }, []);

  const finish = useCallback(() => {
    if (!session.current?.started || session.current.cancelled) return;
    setStatus('stopping');
    ExpoSpeechRecognitionModule.stop();
  }, []);

  useSpeechRecognitionEvent('start', () => {
    if (session.current && !session.current.cancelled) setStatus('listening');
  });
  useSpeechRecognitionEvent('result', (event) => {
    const current = session.current;
    if (!current || current.cancelled || current.failed) return;
    const segment = event.results[0]?.transcript.trim();
    if (!segment) return;
    // iOS 17 returns cumulative text; newer iOS and Android return utterances.
    const cumulative = Platform.OS === 'ios' && Number.parseInt(String(Platform.Version), 10) < 18;
    current.transcript = [current.initialTranscript, cumulative ? '' : current.finalTranscript, segment]
      .filter(Boolean).join(' ');
    if (event.isFinal && !cumulative) {
      current.finalTranscript = [current.finalTranscript, segment].filter(Boolean).join(' ');
    }
    latest.current.onTranscript(current.transcript);
  });
  useSpeechRecognitionEvent('error', (event) => {
    const current = session.current;
    if (!current || current.cancelled) return;
    current.failed = true;
    const denied = event.error === 'not-allowed' || event.error === 'service-not-allowed';
    setNeedsSettings(denied);
    setError(denied
      ? 'System nie pozwala na dyktowanie. Sprawdź zgody mikrofonu i ustawienia rozpoznawania mowy lub wpisz pytanie.'
      : event.error === 'no-speech'
        ? 'Nie usłyszałem pytania. Naciśnij mikrofon i spróbuj ponownie.'
        : event.error === 'network'
          ? 'Rozpoznawanie mowy wymaga teraz internetu. Sprawdź połączenie lub wpisz pytanie.'
          : 'Nie udało się rozpoznać mowy. Spróbuj ponownie lub wpisz pytanie.');
    if (__DEV__) setError(`[DEBUG-voice-fix] ${event.error}: ${event.message}`);
  });
  useSpeechRecognitionEvent('nomatch', () => {
    if (!session.current || session.current.cancelled) return;
    session.current.failed = true;
    setError('Nie rozpoznałem pytania. Naciśnij mikrofon i spróbuj ponownie.');
  });
  useSpeechRecognitionEvent('end', () => {
    const current = session.current;
    if (!current?.started) return;
    session.current = null;
    setStatus('idle');
    if (current.cancelled) {
      if (restartRequested.current !== undefined) {
        const draft = restartRequested.current;
        restartRequested.current = undefined;
        void start(draft);
      }
      return;
    }
    if (current.failed) return;
    if (!current.transcript.trim()) setError('Nie usłyszałem pytania. Naciśnij mikrofon i spróbuj ponownie.');
  });

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') begin();
      else if (state === 'background' || session.current?.started) cancel();
    });
    return () => {
      subscription.remove();
      cancel();
    };
  }, [begin, cancel]);

  return { status, error, needsSettings, start, finish, cancel, isActive: status !== 'idle' };
}
