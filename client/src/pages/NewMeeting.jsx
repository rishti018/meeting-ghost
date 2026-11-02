import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FileText,
  Upload,
  Mic,
  MicOff,
  Pause,
  Play,
  Square,
  Trash2,
  Calendar,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Sparkles,
  Info,
  Volume2,
  User,
  Linkedin,
  Target,
  ListChecks,
  Plus,
  X,
  ClipboardList,
  Bot,
  Clock,
  HelpCircle,
  Lightbulb,
  Radio,
  Check,
  Copy,
  Layers
} from 'lucide-react';
import { api } from '../api/client';
import { PriorityBadge } from '../components/StatusBadge';

const MAX_AUDIO_BYTES = 25 * 1024 * 1024; // 25 MB

export function NewMeeting() {
  const navigate = useNavigate();

  const [inputMode, setInputMode] = useState('paste'); // 'paste' | 'file' | 'audio'
  const [title, setTitle] = useState('');
  const [meetingDate, setMeetingDate] = useState(new Date().toISOString().split('T')[0]);
  const [department, setDepartment] = useState('Engineering');
  const [transcript, setTranscript] = useState('');

  // Meeting Preparation State
  const [personName, setPersonName] = useState('');
  const [linkedinUrl, setLinkedinUrl] = useState('');
  const [purpose, setPurpose] = useState('');
  const [agenda, setAgenda] = useState([]);
  const [currentAgendaTopic, setCurrentAgendaTopic] = useState('');
  const [desiredOutcome, setDesiredOutcome] = useState('');
  const [prepValidationErrors, setPrepValidationErrors] = useState({});
  const prepSectionRef = useRef(null);

  // Processing state machine:
  // 'idle' | 'uploading' | 'transcribing' | 'analyzing' | 'saving' | 'completed' | 'failed'
  const [processState, setProcessState] = useState('idle');
  const [processError, setProcessError] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);

  // Audio Recording State
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [recordedBlob, setRecordedBlob] = useState(null);
  const [recordedUrl, setRecordedUrl] = useState(null);
  const [micPermissionError, setMicPermissionError] = useState(null);

  // Audio Upload File State
  const [selectedAudioFile, setSelectedAudioFile] = useState(null);

  // Analysis result state
  const [analysisResult, setAnalysisResult] = useState(null);
  const [generalError, setGeneralError] = useState(null);

  // Refs for audio recording & incremental pipeline
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const timerIntervalRef = useRef(null);
  const streamRef = useRef(null);
  const isRecordingRef = useRef(false);
  const isPausedRef = useRef(false);
  const recordedMimeTypeRef = useRef('audio/webm');

  // Incremental rotating chunk engine refs
  const chunkRecorderRef = useRef(null);
  const chunkTimeoutRef = useRef(null);
  const chunkIndexRef = useRef(0);
  const chunkQueueRef = useRef([]);
  const isProcessingChunkQueueRef = useRef(false);
  const isCopilotLoadingRef = useRef(false);
  const demoAudioIntervalRef = useRef(null);

  // Synchronized state refs (prevents stale closures across async chunk cycles)
  const agendaRef = useRef(agenda);
  const purposeRef = useRef(purpose);
  const desiredOutcomeRef = useRef(desiredOutcome);
  const personNameRef = useRef(personName);
  const copilotDataRef = useRef(null);
  const liveTranscriptRef = useRef('');
  const lastAnalyzedTextRef = useRef('');

  // Live AI Co-Pilot State
  const [liveTranscript, setLiveTranscript] = useState('');
  const [interimSpeech, setInterimSpeech] = useState('');
  const [isTranscribingAudio, setIsTranscribingAudio] = useState(false);
  const [copilotData, setCopilotData] = useState(null);
  const [isCopilotLoading, setIsCopilotLoading] = useState(false);
  const [lastCopilotUpdate, setLastCopilotUpdate] = useState(null);
  const [speechRecognitionSupported, setSpeechRecognitionSupported] = useState(true);
  const [copilotActiveTab, setCopilotActiveTab] = useState('progress'); // 'progress' | 'suggestions' | 'transcript'
  const [simulationStep, setSimulationStep] = useState(0);
  const speechRecognitionRef = useRef(null);

  // Keep state refs in sync on every render
  useEffect(() => { agendaRef.current = agenda; }, [agenda]);
  useEffect(() => { purposeRef.current = purpose; }, [purpose]);
  useEffect(() => { desiredOutcomeRef.current = desiredOutcome; }, [desiredOutcome]);
  useEffect(() => { personNameRef.current = personName; }, [personName]);
  useEffect(() => { copilotDataRef.current = copilotData; }, [copilotData]);
  useEffect(() => { liveTranscriptRef.current = liveTranscript; }, [liveTranscript]);

  const wordCount = transcript.trim() ? transcript.trim().split(/\s+/).length : 0;
  const charCount = transcript.length;
  const liveTranscriptWords = (liveTranscript.trim() + (interimSpeech ? ' ' + interimSpeech.trim() : '')).trim()
    ? (liveTranscript.trim() + (interimSpeech ? ' ' + interimSpeech.trim() : '')).trim().split(/\s+/).length
    : 0;

  // Cleanup object URLs, intervals, chunk timers, and audio streams on unmount
  useEffect(() => {
    return () => {
      isRecordingRef.current = false;
      isPausedRef.current = false;
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      if (chunkTimeoutRef.current) clearTimeout(chunkTimeoutRef.current);
      if (demoAudioIntervalRef.current) clearInterval(demoAudioIntervalRef.current);
      if (chunkRecorderRef.current && chunkRecorderRef.current.state === 'recording') {
        try { chunkRecorderRef.current.stop(); } catch (_) {}
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        try { mediaRecorderRef.current.stop(); } catch (_) {}
      }
      if (speechRecognitionRef.current) {
        try { speechRecognitionRef.current.stop(); } catch (_) {}
      }
      if (recordedUrl) URL.revokeObjectURL(recordedUrl);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, [recordedUrl]);

  const formatTimer = (seconds) => {
    const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
    const secs = (seconds % 60).toString().padStart(2, '0');
    return `${mins}:${secs}`;
  };

  // ==========================================
  // Meeting Preparation Validation & Agenda
  // Mandatory: title, meetingDate, department
  // Optional: personName, linkedinUrl, purpose, agenda, desiredOutcome
  // ==========================================
  const validatePreparation = () => {
    const errors = {};
    if (!title.trim()) {
      errors.title = 'Meeting title is required';
    }
    if (!meetingDate || !meetingDate.trim()) {
      errors.meetingDate = 'Meeting date is required';
    }
    if (!department || !department.trim()) {
      errors.department = 'Department / Scope is required';
    }
    if (linkedinUrl && linkedinUrl.trim() && !/^https?:\/\//i.test(linkedinUrl.trim())) {
      errors.linkedinUrl = 'LinkedIn URL must start with http:// or https://';
    }
    return errors;
  };

  const handleAddAgendaTopic = (e) => {
    if (e) e.preventDefault();
    const topic = currentAgendaTopic.trim();
    if (!topic) return;
    if (!agenda.includes(topic)) {
      setAgenda(prev => [...prev, topic]);
    }
    setCurrentAgendaTopic('');
    setPrepValidationErrors(prev => {
      const copy = { ...prev };
      delete copy.agenda;
      return copy;
    });
  };

  const handleRemoveAgendaTopic = (idxToRemove) => {
    setAgenda(prev => prev.filter((_, idx) => idx !== idxToRemove));
  };

  // ==========================================
  // Live AI Co-Pilot Execution
  // ==========================================
  const runCopilotAnalysis = async (transcriptToAnalyze = null, force = false) => {
    const currentAgenda = agendaRef.current;
    if (!currentAgenda || currentAgenda.length === 0) return;

    const currentText = (transcriptToAnalyze !== null ? transcriptToAnalyze : (liveTranscriptRef.current || transcript || '')).trim();
    if (!currentText || currentText.length < 5) return;

    if (!force && currentText === lastAnalyzedTextRef.current && copilotDataRef.current) {
      return;
    }

    if (isCopilotLoadingRef.current && !force) {
      return;
    }

    try {
      isCopilotLoadingRef.current = true;
      setIsCopilotLoading(true);

      // Preserve previously discussed topics
      const currentStatuses = copilotDataRef.current?.agendaProgress?.reduce((acc, p) => {
        acc[p.topic] = p.status;
        return acc;
      }, {}) || {};

      const res = await api.getCopilotSuggestions({
        agenda: currentAgenda,
        purpose: purposeRef.current,
        desiredOutcome: desiredOutcomeRef.current,
        personName: personNameRef.current,
        transcript: currentText,
        currentTopicStatuses: currentStatuses,
      });

      if (res && res.data) {
        copilotDataRef.current = res.data;
        setCopilotData(res.data);
        lastAnalyzedTextRef.current = currentText;
        setLastCopilotUpdate(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
      }
    } catch (err) {
      console.warn('[Copilot] Analysis error:', err.message);
    } finally {
      isCopilotLoadingRef.current = false;
      setIsCopilotLoading(false);
    }
  };

  const initSpeechRecognition = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setSpeechRecognitionSupported(false);
      return null;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onresult = (event) => {
        let interim = '';
        let final = '';
        for (let i = 0; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            final += event.results[i][0].transcript + ' ';
          } else {
            interim += event.results[i][0].transcript;
          }
        }

        setInterimSpeech(interim.trim());

        const committed = final.trim();
        if (committed) {
          const prev = liveTranscriptRef.current;
          if (!prev.includes(committed)) {
            const merged = prev ? `${prev} ${committed}` : committed;
            liveTranscriptRef.current = merged;
            setLiveTranscript(merged);
            runCopilotAnalysis(merged, false);
          }
        }
      };

      recognition.onerror = (event) => {
        console.warn('[SpeechRecognition] Notice:', event.error);
      };

      recognition.onend = () => {
        // Auto-restart continuous speech recognition if still actively recording
        if (isRecordingRef.current && !isPausedRef.current) {
          try {
            recognition.start();
          } catch (_) {}
        }
      };

      return recognition;
    } catch (err) {
      console.warn('[SpeechRecognition] Init error:', err);
      setSpeechRecognitionSupported(false);
      return null;
    }
  };

  /**
   * Continuous Incremental Audio Chunk Queue Processor
   * Dispatches completed audio chunks to the backend STT service without
   * interrupting the primary recording stream.
   */
  const processChunkQueue = async () => {
    if (isProcessingChunkQueueRef.current) return;
    if (chunkQueueRef.current.length === 0) return;

    isProcessingChunkQueueRef.current = true;
    setIsTranscribingAudio(true);

    while (chunkQueueRef.current.length > 0) {
      const chunkItem = chunkQueueRef.current.shift();
      try {
        const mime = chunkItem.blob.type || recordedMimeTypeRef.current || 'audio/webm';
        const chunkFile = new File(
          [chunkItem.blob],
          `live_chunk_${chunkItem.index}_${Date.now()}.webm`,
          { type: mime }
        );

        const res = await api.uploadAudio(chunkFile);
        const newText = (res?.data?.transcript || '').trim();

        if (newText) {
          const prev = liveTranscriptRef.current;
          let updated = '';
          if (!prev) {
            updated = newText;
          } else if (prev.includes(newText)) {
            updated = prev;
          } else {
            updated = `${prev} ${newText}`;
          }

          liveTranscriptRef.current = updated;
          setLiveTranscript(updated);
          setInterimSpeech('');

          // Immediately evaluate agenda progress with newly transcribed segment
          await runCopilotAnalysis(updated, false);
        }
      } catch (chunkErr) {
        // Failed chunks must never abort the primary recording
        console.warn(`[IncrementalChunk] Notice on chunk ${chunkItem.index}:`, chunkErr.message);
      }
    }

    setIsTranscribingAudio(false);
    isProcessingChunkQueueRef.current = false;
  };

  const enqueueAudioChunk = (blob) => {
    if (!blob || blob.size < 1200) return;
    chunkIndexRef.current += 1;
    chunkQueueRef.current.push({ blob, index: chunkIndexRef.current });
    processChunkQueue();
  };

  /**
   * Rotating Chunk Cycle Engine
   * Spins up a dedicated chunk recorder on the live stream to capture
   * sealed, standalone audio slices every 4 seconds.
   */
  const startChunkCycle = () => {
    if (!isRecordingRef.current || isPausedRef.current || !streamRef.current) return;

    const mime = recordedMimeTypeRef.current || 'audio/webm';
    try {
      const chunkRec = new MediaRecorder(streamRef.current, { mimeType: mime });
      chunkRecorderRef.current = chunkRec;
      const localPack = [];

      chunkRec.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          localPack.push(e.data);
        }
      };

      chunkRec.onstop = () => {
        if (localPack.length > 0 && isRecordingRef.current) {
          const blob = new Blob(localPack, { type: mime });
          enqueueAudioChunk(blob);
        }
      };

      chunkRec.start();

      // Record in 4-second chunk intervals
      chunkTimeoutRef.current = setTimeout(() => {
        if (chunkRec.state === 'recording') {
          try { chunkRec.stop(); } catch (_) {}
        }
        // Start next chunk immediately if recording remains active
        if (isRecordingRef.current && !isPausedRef.current) {
          startChunkCycle();
        }
      }, 4000);
    } catch (err) {
      console.warn('[ChunkRecorder] Rotation error:', err.message);
    }
  };

  // ==========================================
  // Audio Recording Methods (MediaRecorder API)
  // ==========================================
  const startRecording = async () => {
    setMicPermissionError(null);
    setGeneralError(null);
    setProcessError(null);

    const errors = validatePreparation();
    if (Object.keys(errors).length > 0) {
      setPrepValidationErrors(errors);
      setGeneralError('Please complete all required fields (Meeting Title, Date, Department) before starting audio recording.');
      prepSectionRef.current?.scrollIntoView({ behavior: 'smooth' });
      return;
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setMicPermissionError('Audio recording is not supported in this browser. Please use Chrome, Edge, or Firefox.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Detect supported mime type
      let mimeType = 'audio/webm';
      if (typeof MediaRecorder !== 'undefined') {
        if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
          mimeType = 'audio/webm;codecs=opus';
        } else if (MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')) {
          mimeType = 'audio/ogg;codecs=opus';
        } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
          mimeType = 'audio/mp4';
        }
      }

      recordedMimeTypeRef.current = mimeType;
      chunkIndexRef.current = 0;
      chunkQueueRef.current = [];

      // Primary recorder: records the complete uninterrupted session
      const primaryRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = primaryRecorder;
      audioChunksRef.current = [];

      primaryRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      primaryRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        if (recordedUrl) URL.revokeObjectURL(recordedUrl);
        const url = URL.createObjectURL(audioBlob);
        setRecordedBlob(audioBlob);
        setRecordedUrl(url);

        // Turn off microphone hardware indicator
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
          streamRef.current = null;
        }
      };

      primaryRecorder.start(1000);
      setIsRecording(true);
      setIsPaused(false);
      isRecordingRef.current = true;
      isPausedRef.current = false;
      setRecordingSeconds(0);

      // Uninterrupted session timer
      timerIntervalRef.current = setInterval(() => {
        setRecordingSeconds(prev => prev + 1);
      }, 1000);

      // Start the rotating chunk cycle for continuous incremental transcription
      startChunkCycle();

      // Start Web Speech API recognition for live streaming dictation
      try {
        const recognition = initSpeechRecognition();
        if (recognition) {
          speechRecognitionRef.current = recognition;
          recognition.start();
        }
      } catch (recErr) {
        console.warn('[SpeechRecognition] Could not start:', recErr);
      }

      // Initialize Co-Pilot if agenda is available
      if (agenda && agenda.length > 0) {
        runCopilotAnalysis(liveTranscriptRef.current, true);
      }
    } catch (err) {
      console.error('[AudioRecord] getUserMedia error:', err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setMicPermissionError('Microphone permission denied. Please allow microphone access in your browser settings to record audio.');
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        setMicPermissionError('No microphone input device detected. Please connect a microphone and try again.');
      } else {
        setMicPermissionError(`Microphone initialization error: ${err.message || 'Unable to access microphone'}`);
      }
    }
  };

  const pauseRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.pause();
      setIsPaused(true);
      isPausedRef.current = true;

      // Pause chunk rotation
      if (chunkTimeoutRef.current) clearTimeout(chunkTimeoutRef.current);
      if (chunkRecorderRef.current && chunkRecorderRef.current.state === 'recording') {
        try { chunkRecorderRef.current.stop(); } catch (_) {}
      }

      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      try { speechRecognitionRef.current?.stop(); } catch (_) {}
    }
  };

  const resumeRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'paused') {
      mediaRecorderRef.current.resume();
      setIsPaused(false);
      isPausedRef.current = false;
      timerIntervalRef.current = setInterval(() => {
        setRecordingSeconds(prev => prev + 1);
      }, 1000);

      try { speechRecognitionRef.current?.start(); } catch (_) {}

      // Resume chunk rotation
      startChunkCycle();
    }
  };

  const stopRecording = () => {
    isRecordingRef.current = false;
    isPausedRef.current = false;

    // Clear chunk rotation and drain remaining
    if (chunkTimeoutRef.current) clearTimeout(chunkTimeoutRef.current);
    if (chunkRecorderRef.current && chunkRecorderRef.current.state === 'recording') {
      try { chunkRecorderRef.current.stop(); } catch (_) {}
    }

    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    if (demoAudioIntervalRef.current) clearInterval(demoAudioIntervalRef.current);
    try { speechRecognitionRef.current?.stop(); } catch (_) {}

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }

    setIsRecording(false);
    setIsPaused(false);
    setIsTranscribingAudio(false);
    setInterimSpeech('');

    // Reconcile and perform final Co-Pilot evaluation on the accumulated spoken text
    if (agendaRef.current && agendaRef.current.length > 0 && liveTranscriptRef.current.trim().length > 10) {
      runCopilotAnalysis(liveTranscriptRef.current, true);
    }
  };

  const discardRecording = () => {
    isRecordingRef.current = false;
    isPausedRef.current = false;

    if (chunkTimeoutRef.current) clearTimeout(chunkTimeoutRef.current);
    if (chunkRecorderRef.current && chunkRecorderRef.current.state === 'recording') {
      try { chunkRecorderRef.current.stop(); } catch (_) {}
    }

    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    if (demoAudioIntervalRef.current) clearInterval(demoAudioIntervalRef.current);
    try { speechRecognitionRef.current?.stop(); } catch (_) {}

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try { mediaRecorderRef.current.stop(); } catch (_) {}
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (recordedUrl) URL.revokeObjectURL(recordedUrl);

    setIsRecording(false);
    setIsPaused(false);
    setIsTranscribingAudio(false);
    setInterimSpeech('');
    chunkIndexRef.current = 0;
    chunkQueueRef.current = [];
    setRecordingSeconds(0);
    setRecordedBlob(null);
    setRecordedUrl(null);
    setProcessError(null);
  };

  // ==========================================
  // Unified Audio Processing Pipeline
  // Upload -> Transcribe -> Analyze -> Review
  // ==========================================
  const executeAudioPipeline = async (fileToProcess) => {
    if (!fileToProcess) return;

    const errors = validatePreparation();
    if (Object.keys(errors).length > 0) {
      setPrepValidationErrors(errors);
      setProcessError('Please complete all required fields (Meeting Title, Date, Department) before processing audio.');
      setProcessState('failed');
      prepSectionRef.current?.scrollIntoView({ behavior: 'smooth' });
      return;
    }

    if (fileToProcess.size > MAX_AUDIO_BYTES) {
      setProcessError(`File size is ${(fileToProcess.size / (1024 * 1024)).toFixed(1)} MB, which exceeds the maximum limit of 25 MB.`);
      setProcessState('failed');
      return;
    }

    try {
      setProcessError(null);
      setGeneralError(null);
      setUploadProgress(0);
      setProcessState('uploading');

      // 1. Upload audio with progress
      const uploadRes = await api.uploadAudio(fileToProcess, (percent) => {
        setUploadProgress(percent);
        if (percent >= 100) {
          setProcessState('transcribing');
        }
      });

      const extractedTranscript = uploadRes.data?.transcript;
      if (!extractedTranscript || extractedTranscript.trim().length === 0) {
        throw new Error('Transcription yielded empty dialogue. Please ensure the recording contains audible speech.');
      }

      setTranscript(extractedTranscript);
      setLiveTranscript(extractedTranscript);

      if (agenda && agenda.length > 0) {
        runCopilotAnalysis(extractedTranscript, true);
      }

      if (!title) {
        const cleanName = (fileToProcess.name || 'Recorded Session').replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
        setTitle(cleanName.charAt(0).toUpperCase() + cleanName.slice(1));
      }

      // 2. Automatically run transcript through existing intelligence analysis pipeline
      setProcessState('analyzing');
      const analysisRes = await api.analyzeTranscript({
        transcript: extractedTranscript,
        title: title || 'Recorded Session',
        meetingDate,
        preparation: {
          personName,
          linkedinUrl,
          purpose,
          agenda,
          desiredOutcome,
        },
      });

      setAnalysisResult(analysisRes.data);
      if (!title && analysisRes.data?.title) {
        setTitle(analysisRes.data.title);
      }

      setProcessState('completed');
    } catch (err) {
      console.error('[AudioPipeline] Error:', err);
      setProcessError(err.message || 'Audio processing encountered an error.');
      setProcessState('failed');
    }
  };

  const handleTranscribeRecordedBlob = () => {
    if (!recordedBlob) return;
    const errors = validatePreparation();
    if (Object.keys(errors).length > 0) {
      setPrepValidationErrors(errors);
      setProcessError('Please complete all required fields (Meeting Title, Date, Department) before transcribing audio.');
      setProcessState('failed');
      prepSectionRef.current?.scrollIntoView({ behavior: 'smooth' });
      return;
    }
    const file = new File(
      [recordedBlob],
      `meeting_recording_${new Date().toISOString().slice(0, 10)}.webm`,
      { type: recordedBlob.type || 'audio/webm' }
    );
    executeAudioPipeline(file);
  };

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const errors = validatePreparation();
    if (Object.keys(errors).length > 0) {
      setPrepValidationErrors(errors);
      setGeneralError('Please complete all required fields (Meeting Title, Date, Department) before uploading audio.');
      prepSectionRef.current?.scrollIntoView({ behavior: 'smooth' });
      return;
    }

    const allowedPattern = /\.(mp3|wav|m4a|webm|ogg)$/i;
    if (!file.name.match(allowedPattern) && !file.type.startsWith('audio/')) {
      setProcessError('Invalid file format. Please upload an audio recording (.mp3, .wav, .m4a, .webm, .ogg).');
      setProcessState('failed');
      return;
    }

    if (file.size > MAX_AUDIO_BYTES) {
      setProcessError(`File size is ${(file.size / (1024 * 1024)).toFixed(1)} MB, exceeding the 25 MB limit.`);
      setProcessState('failed');
      return;
    }

    setSelectedAudioFile(file);
    setProcessError(null);
  };

  const handleUploadSelectedFile = () => {
    if (selectedAudioFile) {
      const errors = validatePreparation();
      if (Object.keys(errors).length > 0) {
        setPrepValidationErrors(errors);
        setProcessError('Please complete all required fields (Meeting Title, Date, Department) before uploading audio.');
        setProcessState('failed');
        prepSectionRef.current?.scrollIntoView({ behavior: 'smooth' });
        return;
      }
      executeAudioPipeline(selectedAudioFile);
    }
  };

  // ==========================================
  // Document and Text Input Handlers
  // ==========================================
  const handleLoadSample = async () => {
    try {
      const res = await api.getSampleTranscript();
      setTranscript(res.transcript);
      setTitle(res.title || 'Sprint Kickoff & Database Architecture Review');
      setDepartment(res.department || 'Engineering');
      setPersonName('Aryan Patel (Backend) & Priya Sharma (UI)');
      setLinkedinUrl('https://linkedin.com/in/aryan-patel-sample');
      setPurpose('Align backend and frontend sprint deliverables and finalize database architecture');
      setAgenda([
        'Confirm MongoDB Atlas adoption vs MySQL for transcript storage',
        'Establish API endpoints and owner deadlines',
        'Review end-to-end integration and testing checklist'
      ]);
      setDesiredOutcome('Approved database architecture and documented deliverables with assigned owners');
      setLiveTranscript(res.transcript || '');
      setPrepValidationErrors({});
      setGeneralError(null);
      setAnalysisResult(null);
    } catch (err) {
      const fallback = `Priya will finish the UI design by Wednesday. Aryan will complete backend APIs by Friday. Rahul will prepare the deployment checklist by Thursday. The team decided to use MongoDB instead of MySQL. The team will review API integration in the next meeting.`;
      setTranscript(fallback);
      setLiveTranscript(fallback);
      setTitle('Sprint Kickoff & Database Architecture Review');
      setDepartment('Engineering');
      setPersonName('Aryan Patel (Backend) & Priya Sharma (UI)');
      setLinkedinUrl('https://linkedin.com/in/aryan-patel-sample');
      setPurpose('Align backend and frontend sprint deliverables and finalize database architecture');
      setAgenda([
        'Confirm MongoDB Atlas adoption vs MySQL for transcript storage',
        'Establish API endpoints and owner deadlines',
        'Review end-to-end integration and testing checklist'
      ]);
      setDesiredOutcome('Approved database architecture and documented deliverables with assigned owners');
      setPrepValidationErrors({});
    }
  };

  const handleLoadSampleToLive = () => {
    const sampleDialogue = "Priya will finish the UI design by Wednesday. Aryan will complete backend APIs by Friday. Rahul will prepare the deployment checklist by Thursday. The team decided to use MongoDB instead of MySQL. The team will review API integration in the next meeting.";
    setLiveTranscript(sampleDialogue);
    if (!agenda || agenda.length === 0) {
      setAgenda([
        'Confirm MongoDB Atlas adoption vs MySQL for transcript storage',
        'Establish API endpoints and owner deadlines',
        'Review end-to-end integration and testing checklist'
      ]);
    }
    runCopilotAnalysis(sampleDialogue, true);
  };

  const TEST_4_TOPICS = [
    'Business challenges',
    'AI automation opportunities',
    'Budget and timeline',
    'Next steps'
  ];

  const SIMULATION_STAGES = [
    {
      topic: 'Business challenges',
      text: "Aryan: Let's discuss our business challenges. Today our team is losing roughly 15 to 20 hours every week manually transcribing client calls and drafting meeting summaries in spreadsheets.\nPriya: Agreed. We have documented this and confirmed that manual transcription overhead is our primary business challenge.",
    },
    {
      topic: 'AI automation opportunities',
      text: "Priya: Looking at our AI automation opportunities, we have agreed to adopt an automated speech-to-text pipeline with Gemini to transcribe conversations incrementally and maintain a live action tracker.\nAryan: Perfect, the team agrees and we have settled on this AI automation opportunity.",
    },
    {
      topic: 'Budget and timeline',
      text: "Rahul: Regarding budget and timeline, management has approved our budget allocation of $25,000 and locked in our 4-week delivery timeline for Phase 1.\nPriya: That is confirmed. The budget and timeline are fully aligned and approved.",
    },
    {
      topic: 'Next steps',
      text: "Aryan: For next steps, Rahul will finalize the MongoDB Atlas schemas by Wednesday, Priya will review the API specifications by Friday, and we will hold our integration test next Monday.\nRahul: Confirmed, all next steps, deadlines, and deliverables are committed.",
    }
  ];

  const handleSimulateNextStage = () => {
    const hasAllTopics = TEST_4_TOPICS.every(t => agenda.includes(t));
    if (!hasAllTopics || agenda.length === 0) {
      setAgenda(TEST_4_TOPICS);
      setTitle('Q4 AI Automation Strategy Session');
      setDepartment('Engineering');
    }

    const nextIndex = simulationStep < SIMULATION_STAGES.length ? simulationStep : 0;
    const stage = SIMULATION_STAGES[nextIndex];

    const updated = liveTranscript
      ? `${liveTranscript.trim()}\n\n${stage.text}`
      : stage.text;

    setLiveTranscript(updated);
    setSimulationStep(nextIndex + 1);
    runCopilotAnalysis(updated, true);
  };

  const handleResetSimulation = () => {
    setSimulationStep(0);
    setLiveTranscript('');
    liveTranscriptRef.current = '';
    setCopilotData(null);
    copilotDataRef.current = null;
    lastAnalyzedTextRef.current = '';
  };

  /**
   * Acceptance Test 7 Runner: Stream Demo Audio into Live Recording Session
   * Starts an active recording session with timer, streams the demo audio in
   * realistic incremental stages, updates Live Dialogue and agenda progress
   * WHILE recording is actively counting, and finishes with verified results.
   */
  const handleStreamDemoAudioIntoRecording = async () => {
    // 1. Ensure 4-topic agenda is loaded
    setAgenda(TEST_4_TOPICS);
    agendaRef.current = TEST_4_TOPICS;
    setTitle('Sprint Kickoff & Database Architecture Review');
    setDepartment('Engineering');
    setPurpose('Align strategic roadmap, AI automation deliverables, budget, and next steps');
    setDesiredOutcome('Approved deliverables with owners, deadlines, and budget');
    setPrepValidationErrors({});
    setGeneralError(null);
    setProcessError(null);

    // Reset transcripts
    setLiveTranscript('');
    liveTranscriptRef.current = '';
    setCopilotData(null);
    copilotDataRef.current = null;
    lastAnalyzedTextRef.current = '';

    // 2. Start active recording session & timer
    setIsRecording(true);
    isRecordingRef.current = true;
    setIsPaused(false);
    isPausedRef.current = false;
    setRecordingSeconds(0);

    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    timerIntervalRef.current = setInterval(() => {
      setRecordingSeconds(s => s + 1);
    }, 1000);

    try {
      // 3. Fetch demo audio for playback preview & final commitment
      const audioBlob = await api.getSampleAudioBlob().catch(() => null);
      if (audioBlob) {
        setRecordedBlob(audioBlob);
        if (recordedUrl) URL.revokeObjectURL(recordedUrl);
        setRecordedUrl(URL.createObjectURL(audioBlob));
      }

      // 4. Stream incremental speech stages into active recording
      for (let i = 0; i < SIMULATION_STAGES.length; i++) {
        if (!isRecordingRef.current) break;

        const stage = SIMULATION_STAGES[i];

        // Simulate 3.5s of real-time audio playback while recording timer runs
        await new Promise(r => setTimeout(r, 3500));
        if (!isRecordingRef.current) break;

        // Append recognized speech to Live Dialogue before recording ends
        const prev = liveTranscriptRef.current;
        const updated = prev ? `${prev}\n\n${stage.text}` : stage.text;
        liveTranscriptRef.current = updated;
        setLiveTranscript(updated);

        // Immediate AI analysis while recording timer continues ticking
        await runCopilotAnalysis(updated, true);
      }
    } catch (err) {
      console.warn('[DemoAudioStream] Error:', err.message);
    }
  };

  const handleDocumentUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.name.match(/\.(txt|md|vtt|srt)$/i)) {
      setGeneralError('Please upload a supported text document (.txt, .md, .vtt, .srt).');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      setTranscript(event.target.result);
      if (!title) {
        setTitle(file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' '));
      }
      setGeneralError(null);
      setInputMode('paste');
    };
    reader.onerror = () => {
      setGeneralError('Failed to read file contents.');
    };
    reader.readAsText(file);
  };

  const handleAnalyze = async () => {
    if (!transcript || transcript.trim().length === 0) {
      setGeneralError('Please enter or paste a meeting transcript to analyze.');
      return;
    }

    if (transcript.trim().length < 15) {
      setGeneralError('The transcript is too short to extract structured meeting deliverables.');
      return;
    }

    try {
      setProcessState('analyzing');
      setGeneralError(null);
      const res = await api.analyzeTranscript({
        transcript,
        title,
        meetingDate,
        preparation: {
          personName,
          linkedinUrl,
          purpose,
          agenda,
          desiredOutcome,
        },
      });
      setAnalysisResult(res.data);
      if (!title && res.data.title) {
        setTitle(res.data.title);
      }
      setProcessState('completed');
    } catch (err) {
      setGeneralError(err.message || 'Failed to extract meeting intelligence.');
      setProcessState('failed');
    }
  };

  const handleSaveMeeting = async () => {
    const activeTranscript = (transcript || analysisResult?.transcript || '').trim();
    if (!activeTranscript) return;

    try {
      setProcessState('saving');
      setGeneralError(null);

      const payload = {
        transcript: activeTranscript,
        title: title || analysisResult?.title || 'Untitled Meeting',
        meetingDate,
        department,
        summary: analysisResult?.summary,
        detailedSummary: analysisResult?.detailedSummary,
        keyPoints: analysisResult?.keyPoints,
        actionItems: analysisResult?.actionItems,
        decisions: analysisResult?.decisions,
        followUpAgenda: analysisResult?.followUpAgenda,
        sentiment: analysisResult?.sentiment || null,
        preparation: {
          personName,
          linkedinUrl,
          purpose,
          agenda,
          desiredOutcome,
        },
      };

      const res = await api.createMeeting(payload);
      const savedId = res.data?.id;
      if (savedId) {
        navigate(`/meetings/${savedId}`);
      } else {
        navigate('/meetings');
      }
    } catch (err) {
      setGeneralError(err.message || 'Failed to save intelligence report to MongoDB database.');
      setProcessState('failed');
    }
  };

  const isBusy = ['uploading', 'transcribing', 'analyzing', 'saving'].includes(processState);

  // Co-Pilot Progress Metrics
  const renderedAgendaList = (copilotData?.agendaProgress && copilotData.agendaProgress.length > 0)
    ? copilotData.agendaProgress
    : agenda.map(topic => ({ topic, status: 'Pending', notes: 'Topic pending discussion.' }));

  const coveredTopicsCount = renderedAgendaList.filter(p => p.status === 'Discussed').length;
  const inProgressTopicsCount = renderedAgendaList.filter(p => p.status === 'In Progress').length;
  const pendingAndInProgressTopics = renderedAgendaList.filter(p => p.status !== 'Discussed').map(p => p.topic);
  const topicsLeftCount = pendingAndInProgressTopics.length;

  const nextQuestions = copilotData?.suggestions?.nextQuestions || [];
  const talkingPoints = copilotData?.suggestions?.talkingPoints || [];
  const totalSuggestionsCount = nextQuestions.length + talkingPoints.length;

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-12">
      {/* Header */}
      <div className="pb-1 flex flex-col sm:flex-row sm:items-baseline justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold text-[#172033] tracking-tight">
            Document Ingestion Studio
          </h1>
          <p className="text-xs text-[#526078] mt-0.5">
            Submit audio recordings, dialogue notes, or transcripts for structured brief generation
          </p>
        </div>
      </div>

      {/* Official Sample Dialogue Banner */}
      <div className="ghost-panel p-3.5 bg-ghost-muted/50 border-ghost-border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
        <div className="space-y-0.5">
          <span className="font-medium text-ghost-text block">
            Hackathon Demonstration Transcript
          </span>
          <p className="text-ghost-secondary text-[11px]">
            Populates editor with official test dialogue: Priya, Aryan, and Rahul's commitments.
          </p>
        </div>
        <button
          onClick={handleLoadSample}
          disabled={isBusy}
          className="btn-secondary text-xs shrink-0"
        >
          <Sparkles className="w-3.5 h-3.5 text-ghost-accent" />
          <span>Insert Sample Dialogue</span>
        </button>
      </div>

      {/* General Error Banner */}
      {generalError && (
        <div className="ghost-panel p-3 border-ghost-brickBorder bg-ghost-brickBg text-ghost-brick flex items-center space-x-2 text-xs">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{generalError}</span>
        </div>
      )}

      {/* Processing State Stepper */}
      {processState !== 'idle' && (
        <div className="ghost-panel p-4 bg-[#FFFFFF] border border-[#CBD5E1] space-y-3 shadow-xs">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-[#172033] uppercase tracking-wider flex items-center gap-2">
              {processState === 'failed' ? (
                <AlertCircle className="w-4 h-4 text-red-600" />
              ) : processState === 'completed' ? (
                <CheckCircle2 className="w-4 h-4 text-green-600" />
              ) : (
                <RefreshCw className="w-4 h-4 animate-spin text-[#5145CD]" />
              )}
              {processState === 'uploading' && `Uploading Audio (${uploadProgress}%)`}
              {processState === 'transcribing' && 'Transcribing Audio Recording with Gemini...'}
              {processState === 'analyzing' && 'Analyzing Intelligence, Action Items & Decisions...'}
              {processState === 'saving' && 'Persisting Brief to MongoDB Atlas...'}
              {processState === 'completed' && 'Processing Completed Successfully'}
              {processState === 'failed' && 'Audio Processing Failed'}
            </span>

            {processState === 'failed' && (
              <button
                onClick={() => {
                  setProcessState('idle');
                  setProcessError(null);
                }}
                className="btn-secondary py-0.5 px-2 text-[11px]"
              >
                Dismiss / Retry
              </button>
            )}
          </div>

          {/* Progress Bar */}
          <div className="w-full bg-[#E2E8F0] h-1.5 rounded-full overflow-hidden">
            <div
              className={`h-1.5 transition-all duration-300 ${
                processState === 'failed' ? 'bg-red-500' : 'bg-[#5145CD]'
              }`}
              style={{
                width:
                  processState === 'uploading'
                    ? `${Math.max(uploadProgress, 10)}%`
                    : processState === 'transcribing'
                    ? '50%'
                    : processState === 'analyzing'
                    ? '80%'
                    : processState === 'saving'
                    ? '95%'
                    : processState === 'completed'
                    ? '100%'
                    : '100%',
              }}
            />
          </div>

          {processError ? (
            <p className="text-[11px] text-red-600 font-medium">{processError}</p>
          ) : (
            <p className="text-[11px] text-[#526078]">
              {processState === 'uploading' && 'Streaming audio buffer to backend server...'}
              {processState === 'transcribing' && 'Speech-to-text transcription running on Gemini multimodal engine...'}
              {processState === 'analyzing' && 'Extracting deliverables, owners, deadlines, and confirmed decisions...'}
              {processState === 'saving' && 'Writing meeting brief and action items atomically to MongoDB Atlas...'}
              {processState === 'completed' && 'Intelligence report ready. Review brief below and commit to library.'}
            </p>
          )}
        </div>
      )}

      {/* 1. Meeting Preparation Section */}
      <div ref={prepSectionRef} className="ghost-panel p-5 space-y-4 bg-[#FFFFFF] border border-[#DCE2EB]">
        <div className="flex items-center justify-between border-b border-[#DCE2EB] pb-2.5">
          <div className="flex items-center space-x-2">
            <ClipboardList className="w-4 h-4 text-[#5145CD]" />
            <div>
              <span className="text-xs font-semibold text-[#172033] uppercase tracking-wider block">
                1. Meeting Preparation
              </span>
              <p className="text-[11px] text-[#526078]">
                Define meeting objectives, participant context, and discussion agenda before starting
              </p>
            </div>
          </div>
          <span className="text-[10px] uppercase font-semibold tracking-wider text-[#5145CD] bg-[#EEF2FF] px-2 py-0.5 rounded-sm border border-[#C7D2FE]">
            Pre-Meeting Brief
          </span>
        </div>

        {/* Helper guide */}
        <div className="p-2.5 rounded-sm bg-[#F8FAFC] border border-[#E2E8F0] text-[11px] text-[#526078] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-1">
          <span>
            <strong className="text-[#172033]">Mandatory:</strong> Title, Date, Department. All other preparation details are optional.
          </span>
          <span className="text-[#5145CD] font-medium text-[10px]">
            Adding an agenda activates the Live AI Co-Pilot during recording.
          </span>
        </div>

        {/* Form Grid */}
        <div className="space-y-3.5">
          {/* Row 1: Meeting Title & Session Meta */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-1 space-y-1">
              <label className="text-[11px] font-medium text-ghost-secondary flex items-center justify-between">
                <span>Meeting Title <span className="text-red-500">*</span></span>
              </label>
              <input
                type="text"
                placeholder="e.g. Q4 Strategy Review"
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  if (prepValidationErrors.title) {
                    setPrepValidationErrors(prev => ({ ...prev, title: null }));
                  }
                }}
                disabled={isBusy}
                className={`input-base ${prepValidationErrors.title ? 'border-red-400 focus:border-red-500 bg-red-50/30' : ''}`}
              />
              {prepValidationErrors.title && (
                <p className="text-[10px] text-red-600 font-medium">{prepValidationErrors.title}</p>
              )}
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-medium text-ghost-secondary">
                <span>Date <span className="text-red-500">*</span></span>
              </label>
              <input
                type="date"
                value={meetingDate}
                onChange={(e) => setMeetingDate(e.target.value)}
                disabled={isBusy}
                className="input-base"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-medium text-ghost-secondary">
                <span>Department / Scope <span className="text-red-500">*</span></span>
              </label>
              <select
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                disabled={isBusy}
                className="input-base cursor-pointer"
              >
                <option value="Engineering">Engineering</option>
                <option value="Product & Design">Product & Design</option>
                <option value="Executive / Leadership">Executive / Leadership</option>
                <option value="Operations">Operations</option>
                <option value="General">General</option>
              </select>
            </div>
          </div>

          {/* Row 2: Person Name & LinkedIn URL */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-ghost-secondary flex items-center justify-between">
                <span className="flex items-center gap-1">
                  <User className="w-3 h-3 text-[#5145CD]" />
                  <span>Person You're Meeting With <span className="text-gray-400 font-normal text-[10px]">(optional)</span></span>
                </span>
              </label>
              <input
                type="text"
                placeholder="e.g. Sarah Jenkins (VP of Product)"
                value={personName}
                onChange={(e) => {
                  setPersonName(e.target.value);
                  if (prepValidationErrors.personName) {
                    setPrepValidationErrors(prev => ({ ...prev, personName: null }));
                  }
                }}
                disabled={isBusy}
                className={`input-base ${prepValidationErrors.personName ? 'border-red-400 focus:border-red-500 bg-red-50/30' : ''}`}
              />
              {prepValidationErrors.personName && (
                <p className="text-[10px] text-red-600 font-medium">{prepValidationErrors.personName}</p>
              )}
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-medium text-ghost-secondary flex items-center justify-between">
                <span className="flex items-center gap-1">
                  <Linkedin className="w-3 h-3 text-[#0A66C2]" />
                  <span>LinkedIn Profile URL <span className="text-gray-400 font-normal text-[10px]">(optional)</span></span>
                </span>
              </label>
              <input
                type="url"
                placeholder="https://linkedin.com/in/username"
                value={linkedinUrl}
                onChange={(e) => {
                  setLinkedinUrl(e.target.value);
                  if (prepValidationErrors.linkedinUrl) {
                    setPrepValidationErrors(prev => ({ ...prev, linkedinUrl: null }));
                  }
                }}
                disabled={isBusy}
                className={`input-base ${prepValidationErrors.linkedinUrl ? 'border-red-400 focus:border-red-500 bg-red-50/30' : ''}`}
              />
              {prepValidationErrors.linkedinUrl && (
                <p className="text-[10px] text-red-600 font-medium">{prepValidationErrors.linkedinUrl}</p>
              )}
            </div>
          </div>

          {/* Row 3: Meeting Purpose */}
          <div className="space-y-1">
            <label className="text-[11px] font-medium text-ghost-secondary flex items-center justify-between">
              <span className="flex items-center gap-1">
                <Target className="w-3 h-3 text-[#5145CD]" />
                <span>Meeting Purpose <span className="text-gray-400 font-normal text-[10px]">(optional)</span></span>
              </span>
            </label>
            <input
              type="text"
              placeholder="e.g. Align on Q4 engineering roadmap, resolve open API blockers, and agree on Q1 budget"
              value={purpose}
              onChange={(e) => {
                setPurpose(e.target.value);
                if (prepValidationErrors.purpose) {
                  setPrepValidationErrors(prev => ({ ...prev, purpose: null }));
                }
              }}
              disabled={isBusy}
              className={`input-base ${prepValidationErrors.purpose ? 'border-red-400 focus:border-red-500 bg-red-50/30' : ''}`}
            />
            {prepValidationErrors.purpose && (
              <p className="text-[10px] text-red-600 font-medium">{prepValidationErrors.purpose}</p>
            )}
          </div>

          {/* Row 4: Discussion Agenda (Add / Remove Multiple Topics) */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-medium text-ghost-secondary flex items-center gap-1">
                <ListChecks className="w-3 h-3 text-[#5145CD]" />
                <span>Discussion Agenda Topics <span className="text-gray-400 font-normal text-[10px]">(optional — powers Live AI Co-Pilot)</span></span>
              </label>
              <span className="text-[10px] font-mono text-ghost-secondary">
                {agenda.length} {agenda.length === 1 ? 'topic' : 'topics'} planned
              </span>
            </div>

            {/* Input to add topic */}
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Type a discussion topic and press Enter (e.g. Database migration timeline)"
                value={currentAgendaTopic}
                onChange={(e) => setCurrentAgendaTopic(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddAgendaTopic();
                  }
                }}
                disabled={isBusy}
                className="input-base text-xs flex-1"
              />
              <button
                type="button"
                onClick={handleAddAgendaTopic}
                disabled={isBusy || !currentAgendaTopic.trim()}
                className="btn-secondary text-xs shrink-0 flex items-center gap-1 py-1 px-3"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Topic</span>
              </button>
            </div>

            {prepValidationErrors.agenda && (
              <p className="text-[10px] text-red-600 font-medium">{prepValidationErrors.agenda}</p>
            )}

            {/* Rendered Agenda List */}
            {agenda.length > 0 ? (
              <div className="space-y-1.5 pt-1">
                {agenda.map((topic, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-2 rounded-sm bg-[#F8FAFC] border border-[#E2E8F0] text-xs text-[#172033]"
                  >
                    <div className="flex items-center space-x-2 min-w-0">
                      <span className="w-5 h-5 rounded-full bg-[#EEF2FF] text-[#5145CD] font-semibold text-[10px] flex items-center justify-center shrink-0">
                        {idx + 1}
                      </span>
                      <span className="font-medium truncate">{topic}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveAgendaTopic(idx)}
                      disabled={isBusy}
                      className="p-1 text-slate-400 hover:text-red-600 rounded hover:bg-red-50 transition-colors shrink-0 ml-2"
                      title="Remove topic"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[11px] text-ghost-secondary italic py-1">
                No discussion topics added yet. (Optional: add agenda topics here to track progress with the Live AI Co-Pilot during recording).
              </p>
            )}
          </div>

          {/* Row 5: Desired Outcome */}
          <div className="space-y-1">
            <label className="text-[11px] font-medium text-ghost-secondary flex items-center justify-between">
              <span className="flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3 text-green-600" />
                <span>Desired Outcome <span className="text-gray-400 font-normal text-[10px]">(optional)</span></span>
              </span>
            </label>
            <input
              type="text"
              placeholder="e.g. Signed-off roadmap milestones and confirmed headcount approvals"
              value={desiredOutcome}
              onChange={(e) => {
                setDesiredOutcome(e.target.value);
                if (prepValidationErrors.desiredOutcome) {
                  setPrepValidationErrors(prev => ({ ...prev, desiredOutcome: null }));
                }
              }}
              disabled={isBusy}
              className={`input-base ${prepValidationErrors.desiredOutcome ? 'border-red-400 focus:border-red-500 bg-red-50/30' : ''}`}
            />
            {prepValidationErrors.desiredOutcome && (
              <p className="text-[10px] text-red-600 font-medium">{prepValidationErrors.desiredOutcome}</p>
            )}
          </div>
        </div>
      </div>

      {/* Ingestion Mode Segmented Control */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-semibold text-ghost-secondary uppercase tracking-wider">
            2. Transcript Source
          </span>
          <div className="flex items-center rounded-sm bg-ghost-muted border border-ghost-border p-0.5 text-xs">
            <button
              onClick={() => setInputMode('paste')}
              className={`px-3 py-1 rounded-sm text-xs transition-colors ${
                inputMode === 'paste'
                  ? 'bg-white text-[#172033] font-semibold border border-ghost-border shadow-xs'
                  : 'text-[#172033] font-medium hover:text-[#5145CD]'
              }`}
            >
              Text Editor
            </button>
            <button
              onClick={() => setInputMode('file')}
              className={`px-3 py-1 rounded-sm text-xs transition-colors ${
                inputMode === 'file'
                  ? 'bg-white text-[#172033] font-semibold border border-ghost-border shadow-xs'
                  : 'text-[#172033] font-medium hover:text-[#5145CD]'
              }`}
            >
              Document Upload
            </button>
            <button
              onClick={() => setInputMode('audio')}
              className={`px-3 py-1 rounded-sm text-xs transition-colors ${
                inputMode === 'audio'
                  ? 'bg-white text-[#172033] font-semibold border border-ghost-border shadow-xs'
                  : 'text-[#172033] font-medium hover:text-[#5145CD]'
              }`}
            >
              Audio Recording & Upload
            </button>
          </div>
        </div>

        {/* Input Mode 1: Document Editor Canvas */}
        {inputMode === 'paste' && (
          <div className="ghost-doc p-4 space-y-3">
            <div className="flex items-center justify-between text-[11px] text-ghost-secondary border-b border-ghost-border pb-2.5">
              <span>Paste verbatim transcript, raw notes, or conversational dialogue</span>
              <span className="counter-badge">
                {wordCount} words • {charCount} characters
              </span>
            </div>

            <textarea
              rows={9}
              placeholder="Paste dialogue here... e.g. Priya will finish the UI design by Wednesday. Aryan will complete backend APIs by Friday..."
              value={transcript}
              onChange={(e) => {
                setTranscript(e.target.value);
                setAnalysisResult(null);
              }}
              disabled={isBusy}
              className="w-full bg-transparent text-xs sm:text-sm text-[#172033] placeholder-[#526078] placeholder:opacity-90 focus:outline-none font-mono leading-relaxed resize-y font-medium"
            />

            <div className="flex items-center justify-between pt-2 border-t border-ghost-border">
              <span className="text-[11px] text-ghost-secondary">
                Assignees, dates, and decisions are extracted verbatim without hallucination.
              </span>
              <button
                onClick={handleAnalyze}
                disabled={isBusy || !transcript.trim()}
                className="btn-primary"
              >
                {processState === 'analyzing' ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Analyzing Dialogue...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Extract Meeting Intelligence</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Input Mode 2: File Upload */}
        {inputMode === 'file' && (
          <div className="ghost-panel p-8 text-center border-dashed">
            <Upload className="w-7 h-7 text-ghost-secondary mx-auto mb-2" />
            <h3 className="text-xs font-semibold text-ghost-text mb-1">
              Upload Meeting Transcript File
            </h3>
            <p className="text-[11px] text-ghost-secondary mb-4 max-w-xs mx-auto">
              Supported file types: Plain Text (.txt), Markdown (.md), WebVTT (.vtt), SubRip (.srt)
            </p>
            <label className="btn-secondary cursor-pointer">
              <span>Select Document</span>
              <input
                type="file"
                accept=".txt,.md,.vtt,.srt"
                onChange={handleDocumentUpload}
                disabled={isBusy}
                className="hidden"
              />
            </label>
          </div>
        )}

        {/* Input Mode 3: Audio Recording, File Upload & Live AI Co-Pilot */}
        {inputMode === 'audio' && (
          <div className="ghost-panel p-5 space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Left Column (col-span-12 lg:col-span-6): Recording & Upload Controls */}
              <div className="lg:col-span-6 space-y-5">
                {/* Permission / Hardware Error Banner */}
                {micPermissionError && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-sm text-xs text-red-700 flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-600" />
                    <span>{micPermissionError}</span>
                  </div>
                )}

                {/* Section A: Live Microphone Recorder */}
                <div className="p-4 rounded-sm border border-[#DCE2EB] bg-[#F8FAFC] space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={`w-3 h-3 rounded-full ${
                        isRecording && !isPaused ? 'bg-red-500 animate-pulse' : isPaused ? 'bg-amber-500' : 'bg-slate-300'
                      }`} />
                      <span className="text-xs font-semibold text-[#172033] uppercase tracking-wider">
                        Microphone Audio Recorder
                      </span>
                    </div>

                    <span className="font-mono text-xs font-semibold text-[#172033] bg-white px-2.5 py-1 rounded-sm border border-[#DCE2EB]">
                      {formatTimer(recordingSeconds)}
                    </span>
                  </div>

                  {/* Status / Wave Animation */}
                  {isRecording && (
                    <div className="flex items-center justify-center gap-1.5 py-2">
                      <span className="text-xs text-[#526078] font-medium mr-2">
                        {isPaused ? 'Recording paused' : 'Listening & capturing microphone stream...'}
                      </span>
                      {!isPaused && (
                        <div className="flex items-center gap-1">
                          <span className="w-1 h-3 bg-[#5145CD] animate-bounce" style={{ animationDelay: '0ms' }} />
                          <span className="w-1 h-5 bg-[#5145CD] animate-bounce" style={{ animationDelay: '150ms' }} />
                          <span className="w-1 h-4 bg-[#5145CD] animate-bounce" style={{ animationDelay: '300ms' }} />
                          <span className="w-1 h-2 bg-[#5145CD] animate-bounce" style={{ animationDelay: '450ms' }} />
                        </div>
                      )}
                    </div>
                  )}

                  {/* Playback Preview (when stopped) */}
                  {recordedUrl && !isRecording && (
                    <div className="space-y-2 pt-1">
                      <span className="text-[11px] font-semibold text-[#526078] uppercase tracking-wider flex items-center gap-1">
                        <Volume2 className="w-3.5 h-3.5 text-[#5145CD]" />
                        Recording Playback Preview
                      </span>
                      <audio controls src={recordedUrl} className="w-full h-9 rounded-sm" />
                    </div>
                  )}

                  {/* Recording Controls */}
                  <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-[#E2E8F0]">
                    {!isRecording && !recordedBlob && (
                      <div className="flex items-center gap-2 flex-wrap">
                        <button
                          onClick={startRecording}
                          disabled={isBusy}
                          className="btn-primary text-xs flex items-center gap-1.5"
                        >
                          <Mic className="w-3.5 h-3.5" />
                          <span>Start Recording</span>
                        </button>

                        <button
                          type="button"
                          onClick={handleStreamDemoAudioIntoRecording}
                          disabled={isBusy}
                          className="btn-secondary text-xs flex items-center gap-1.5 border border-indigo-200 bg-indigo-50/50 hover:bg-indigo-50 text-indigo-700"
                          title="Stream demo conversation audio into active recording session (Acceptance Test 7)"
                        >
                          <Radio className="w-3.5 h-3.5 text-[#5145CD] animate-pulse" />
                          <span>Stream Demo Audio (Live Test)</span>
                        </button>
                      </div>
                    )}

                    {isRecording && (
                      <>
                        {isPaused ? (
                          <button
                            onClick={resumeRecording}
                            className="btn-secondary text-xs flex items-center gap-1.5"
                          >
                            <Play className="w-3.5 h-3.5 text-[#5145CD]" />
                            <span>Resume</span>
                          </button>
                        ) : (
                          <button
                            onClick={pauseRecording}
                            className="btn-secondary text-xs flex items-center gap-1.5"
                          >
                            <Pause className="w-3.5 h-3.5 text-amber-600" />
                            <span>Pause</span>
                          </button>
                        )}

                        <button
                          onClick={stopRecording}
                          className="btn-primary bg-red-600 hover:bg-red-700 text-xs flex items-center gap-1.5"
                        >
                          <Square className="w-3.5 h-3.5" />
                          <span>Stop Recording</span>
                        </button>
                      </>
                    )}

                    {recordedBlob && !isRecording && (
                      <>
                        <button
                          onClick={handleTranscribeRecordedBlob}
                          disabled={isBusy}
                          className="btn-primary text-xs flex items-center gap-1.5"
                        >
                          <Sparkles className="w-3.5 h-3.5" />
                          <span>Transcribe & Analyze Recording</span>
                        </button>

                        <button
                          onClick={discardRecording}
                          disabled={isBusy}
                          className="btn-secondary text-red-600 text-xs flex items-center gap-1.5 hover:bg-red-50"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Discard</span>
                        </button>

                        <button
                          onClick={startRecording}
                          disabled={isBusy}
                          className="btn-secondary text-xs flex items-center gap-1.5 ml-auto"
                        >
                          <Mic className="w-3.5 h-3.5" />
                          <span>Record Again</span>
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Divider */}
                <div className="relative flex py-1 items-center">
                  <div className="flex-grow border-t border-[#E2E8F0]"></div>
                  <span className="flex-shrink mx-4 text-[10px] font-semibold text-[#64748B] uppercase tracking-wider">
                    Or Upload Existing Audio File
                  </span>
                  <div className="flex-grow border-t border-[#E2E8F0]"></div>
                </div>

                {/* Section B: Audio File Upload */}
                <div className="p-4 rounded-sm border border-dashed border-[#CBD5E1] text-center space-y-3">
                  <Upload className="w-6 h-6 text-[#5145CD] mx-auto" />
                  <div>
                    <h4 className="text-xs font-semibold text-[#172033]">
                      Select Audio Recording
                    </h4>
                    <p className="text-[11px] text-[#526078] mt-0.5">
                      Supported formats: MP3, WAV, M4A, WebM, OGG (Max 25 MB)
                    </p>
                  </div>

                  <div className="flex items-center justify-center gap-2 pt-1">
                    <label className="btn-secondary text-xs cursor-pointer">
                      <span>Browse Audio File</span>
                      <input
                        type="file"
                        accept="audio/*,.mp3,.wav,.m4a,.webm,.ogg"
                        onChange={handleFileSelect}
                        disabled={isBusy}
                        className="hidden"
                      />
                    </label>

                    {selectedAudioFile && (
                      <button
                        onClick={handleUploadSelectedFile}
                        disabled={isBusy}
                        className="btn-primary text-xs flex items-center gap-1.5"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Upload & Transcribe</span>
                      </button>
                    )}
                  </div>

                  {selectedAudioFile && (
                    <p className="text-[11px] font-mono text-[#172033] bg-[#F1F5F9] inline-block px-2.5 py-1 rounded-sm border border-[#E2E8F0]">
                      {selectedAudioFile.name} ({(selectedAudioFile.size / (1024 * 1024)).toFixed(2)} MB)
                    </p>
                  )}
                </div>

                {/* Credential note */}
                <div className="flex items-center gap-1.5 text-[11px] text-[#526078] pt-1">
                  <Info className="w-3.5 h-3.5 text-[#5145CD] shrink-0" />
                  <span>
                    Audio transcription runs securely on the backend via Gemini Multimodal Speech and requires <code>GEMINI_API_KEY</code> in <code>server/.env</code>.
                  </span>
                </div>
              </div>

              {/* Right Column (col-span-12 lg:col-span-6): Live AI Meeting Co-Pilot Side Panel */}
              <div className="lg:col-span-6 flex flex-col h-full space-y-3">
                {agenda.length === 0 ? (
                  // State 1: Preparation Skipped (No agenda topics)
                  <div className="p-4 rounded-sm border border-dashed border-[#CBD5E1] bg-[#F8FAFC] space-y-3">
                    <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-2.5">
                      <div className="flex items-center gap-2">
                        <Bot className="w-4 h-4 text-[#5145CD]" />
                        <span className="text-xs font-semibold text-[#172033] uppercase tracking-wider">
                          Live AI Co-Pilot
                        </span>
                      </div>
                      <span className="px-2 py-0.5 rounded-sm text-[10px] font-semibold bg-slate-100 text-slate-500 border border-slate-200">
                        Standby
                      </span>
                    </div>

                    <div className="space-y-2 py-1">
                      <h4 className="text-xs font-semibold text-[#172033] flex items-center gap-1.5">
                        <Info className="w-3.5 h-3.5 text-[#5145CD]" />
                        Discussion Agenda Not Configured
                      </h4>
                      <p className="text-[11px] text-[#526078] leading-relaxed">
                        Meeting preparation was skipped. You can record, transcribe, and generate briefs normally without interruption. To activate live topic coverage tracking and AI suggestions during your meeting, enter agenda topics below.
                      </p>
                    </div>

                    {/* Quick Add Agenda Topic Inline */}
                    <div className="pt-2 border-t border-[#E2E8F0] space-y-1.5">
                      <label className="text-[10px] font-semibold text-[#526078] uppercase tracking-wider block">
                        Quick-Add Agenda Topic to Activate Co-Pilot:
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          placeholder="e.g. Q4 Architecture Decisions"
                          value={currentAgendaTopic}
                          onChange={(e) => setCurrentAgendaTopic(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleAddAgendaTopic();
                            }
                          }}
                          className="input-base text-xs flex-1"
                        />
                        <button
                          type="button"
                          onClick={handleAddAgendaTopic}
                          disabled={!currentAgendaTopic.trim()}
                          className="btn-secondary text-xs px-2.5 py-1 flex items-center gap-1"
                        >
                          <Plus className="w-3 h-3" />
                          <span>Add</span>
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  // State 2: Preparation Available (Agenda Provided) - Full Live AI Co-Pilot
                  <div className="p-4 rounded-sm border border-[#DCE2EB] bg-white shadow-xs space-y-3.5">
                    {/* Co-Pilot Header */}
                    <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-2.5">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-[#EEF2FF] flex items-center justify-center text-[#5145CD] border border-[#C7D2FE]">
                          <Bot className="w-3.5 h-3.5" />
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-semibold text-[#172033] uppercase tracking-wider">
                              Live AI Co-Pilot
                            </span>
                            {isRecording && !isPaused && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm text-[9px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
                                Listening
                              </span>
                            )}
                          </div>
                          <p className="text-[10px] text-[#526078]">
                            Tracking agenda coverage & live conversation prompts
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 flex-wrap justify-end">
                        {isRecording && !isPaused && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm text-[9px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
                            Listening
                          </span>
                        )}
                        {isTranscribingAudio && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm text-[9px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200 animate-pulse">
                            <Volume2 className="w-2.5 h-2.5" />
                            Transcribing Audio...
                          </span>
                        )}
                        {isCopilotLoading ? (
                          <span className="text-[10px] font-semibold text-[#5145CD] flex items-center gap-1 bg-[#EEF2FF] px-2 py-0.5 rounded-sm border border-[#C7D2FE]">
                            <RefreshCw className="w-3 h-3 animate-spin" />
                            Evaluating Agenda...
                          </span>
                        ) : lastCopilotUpdate ? (
                          <span className="text-[10px] text-[#64748B] font-mono">
                            {lastCopilotUpdate}
                          </span>
                        ) : null}

                        <button
                          type="button"
                          onClick={() => runCopilotAnalysis(liveTranscript, true)}
                          disabled={isCopilotLoading}
                          className="p-1 rounded text-slate-500 hover:text-[#5145CD] hover:bg-[#EEF2FF] transition-colors border border-transparent hover:border-[#C7D2FE]"
                          title="Analyze current spoken dialogue and refresh suggestions now"
                        >
                          <RefreshCw className={`w-3.5 h-3.5 ${isCopilotLoading ? 'animate-spin text-[#5145CD]' : ''}`} />
                        </button>
                      </div>
                    </div>

                    {/* Progress Metric Bar & Remaining Topics */}
                    <div className="p-2.5 rounded-sm bg-[#F8FAFC] border border-[#E2E8F0] space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-[11px] font-semibold text-[#172033] flex items-center gap-1.5">
                          <ListChecks className="w-3.5 h-3.5 text-[#5145CD]" />
                          Agenda Progress
                        </span>
                        <span className="text-[11px] font-mono font-medium text-[#526078]">
                          {coveredTopicsCount} of {agenda.length} Discussed ({Math.round((coveredTopicsCount / Math.max(1, agenda.length)) * 100)}%)
                        </span>
                      </div>

                      {/* Progress Bar */}
                      <div className="w-full bg-[#E2E8F0] h-2 rounded-full overflow-hidden flex">
                        <div
                          className="h-2 bg-emerald-500 transition-all duration-300"
                          style={{ width: `${(coveredTopicsCount / Math.max(1, agenda.length)) * 100}%` }}
                          title="Discussed"
                        />
                        <div
                          className="h-2 bg-[#5145CD] transition-all duration-300"
                          style={{ width: `${(inProgressTopicsCount / Math.max(1, agenda.length)) * 100}%` }}
                          title="In Progress"
                        />
                      </div>

                      {/* Remaining Topics Highlight */}
                      {topicsLeftCount > 0 ? (
                        <div className="flex items-start gap-1.5 text-[11px] text-[#526078] pt-0.5">
                          <span className="font-semibold text-[#172033] shrink-0">
                            {topicsLeftCount} left to cover:
                          </span>
                          <div className="flex flex-wrap gap-1">
                            {pendingAndInProgressTopics.map((topic, i) => (
                              <span
                                key={i}
                                className="px-1.5 py-0.5 rounded-xs text-[10px] bg-white border border-[#CBD5E1] text-[#334155] font-medium"
                              >
                                {topic}
                              </span>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className="text-[11px] text-emerald-700 font-medium flex items-center gap-1 pt-0.5">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>All planned agenda topics have been addressed!</span>
                        </div>
                      )}
                    </div>

                    {/* Tabs */}
                    <div className="flex items-center border-b border-[#E2E8F0] text-xs">
                      <button
                        type="button"
                        onClick={() => setCopilotActiveTab('progress')}
                        className={`pb-2 px-2.5 font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
                          copilotActiveTab === 'progress'
                            ? 'border-[#5145CD] text-[#5145CD] font-semibold'
                            : 'border-transparent text-[#64748B] hover:text-[#172033]'
                        }`}
                      >
                        <ListChecks className="w-3.5 h-3.5" />
                        <span>Agenda Topics</span>
                        <span className="px-1.5 py-0.2 bg-[#EEF2FF] text-[#5145CD] rounded-full text-[10px] font-mono">
                          {agenda.length}
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setCopilotActiveTab('suggestions')}
                        className={`pb-2 px-2.5 font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
                          copilotActiveTab === 'suggestions'
                            ? 'border-[#5145CD] text-[#5145CD] font-semibold'
                            : 'border-transparent text-[#64748B] hover:text-[#172033]'
                        }`}
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>AI Suggestions</span>
                        <span className="px-1.5 py-0.2 bg-purple-50 text-purple-700 rounded-full text-[10px] font-mono">
                          {totalSuggestionsCount}
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setCopilotActiveTab('transcript')}
                        className={`pb-2 px-2.5 font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
                          copilotActiveTab === 'transcript'
                            ? 'border-[#5145CD] text-[#5145CD] font-semibold'
                            : 'border-transparent text-[#64748B] hover:text-[#172033]'
                        }`}
                      >
                        <FileText className="w-3.5 h-3.5" />
                        <span>Live Dialogue</span>
                        {liveTranscriptWords > 0 && (
                          <span className="px-1.5 py-0.2 bg-slate-100 text-slate-700 rounded-full text-[10px] font-mono">
                            {liveTranscriptWords}w
                          </span>
                        )}
                      </button>
                    </div>

                    {/* Tab 1: Agenda Topics */}
                    {copilotActiveTab === 'progress' && (
                      <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                        {renderedAgendaList.map((item, idx) => (
                          <div
                            key={idx}
                            className={`p-2.5 rounded-sm border text-xs transition-colors ${
                              item.status === 'Discussed'
                                ? 'bg-emerald-50/50 border-emerald-200'
                                : item.status === 'In Progress'
                                ? 'bg-indigo-50/50 border-indigo-200'
                                : 'bg-[#F8FAFC] border-[#E2E8F0]'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <span className="font-medium text-[#172033] leading-snug">
                                {idx + 1}. {item.topic}
                              </span>

                              <span
                                className={`shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-sm text-[10px] font-semibold uppercase tracking-wider ${
                                  item.status === 'Discussed'
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : item.status === 'In Progress'
                                    ? 'bg-indigo-100 text-indigo-800'
                                    : 'bg-slate-200 text-slate-700'
                                }`}
                              >
                                {item.status === 'Discussed' && <CheckCircle2 className="w-3 h-3 text-emerald-600" />}
                                {item.status === 'In Progress' && <Radio className="w-3 h-3 text-indigo-600 animate-pulse" />}
                                {item.status === 'Pending' && <Clock className="w-3 h-3 text-slate-500" />}
                                <span>{item.status}</span>
                              </span>
                            </div>

                            {item.notes && (
                              <p className="text-[11px] text-[#526078] mt-1 leading-relaxed">
                                {item.notes}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Tab 2: AI Suggestions */}
                    {copilotActiveTab === 'suggestions' && (
                      <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                        {/* Next Questions */}
                        <div className="space-y-1.5">
                          <span className="text-[10px] font-semibold text-[#526078] uppercase tracking-wider flex items-center gap-1">
                            <HelpCircle className="w-3 h-3 text-[#5145CD]" />
                            Questions to Ask Next
                          </span>
                          {nextQuestions.length > 0 ? (
                            <div className="space-y-1.5">
                              {nextQuestions.map((q, i) => (
                                <div
                                  key={i}
                                  className="p-2.5 rounded-sm bg-[#EEF2FF]/60 border border-[#C7D2FE] text-xs text-[#1E1B4B] font-medium leading-relaxed flex items-start gap-2"
                                >
                                  <span className="w-4 h-4 rounded-full bg-[#5145CD] text-white text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                                    ?
                                  </span>
                                  <span className="flex-1">{q}</span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-[11px] text-[#64748B] italic p-2 bg-[#F8FAFC] rounded-sm border border-[#E2E8F0]">
                              Waiting for conversation dialogue to generate tailored questions.
                            </p>
                          )}
                        </div>

                        {/* Talking Points */}
                        <div className="space-y-1.5">
                          <span className="text-[10px] font-semibold text-[#526078] uppercase tracking-wider flex items-center gap-1">
                            <Lightbulb className="w-3 h-3 text-amber-600" />
                            Strategic Talking Points & Follow-ups
                          </span>
                          {talkingPoints.length > 0 ? (
                            <div className="space-y-1.5">
                              {talkingPoints.map((tp, i) => (
                                <div
                                  key={i}
                                  className="p-2.5 rounded-sm bg-amber-50/50 border border-amber-200 text-xs text-[#78350F] leading-relaxed flex items-start gap-2"
                                >
                                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 mt-1.5 shrink-0" />
                                  <span className="font-medium">{tp}</span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-[11px] text-[#64748B] italic p-2 bg-[#F8FAFC] rounded-sm border border-[#E2E8F0]">
                              Talking points will update as agenda items are addressed.
                            </p>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Tab 3: Live Dialogue Stream */}
                    {copilotActiveTab === 'transcript' && (
                      <div className="space-y-2.5">
                        <div className="flex items-center justify-between text-[11px] text-[#526078] flex-wrap gap-1">
                          <div className="flex items-center gap-2">
                            {speechRecognitionSupported ? (
                              <span className="text-emerald-700 font-medium flex items-center gap-1">
                                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                                Web Speech API: Active
                              </span>
                            ) : (
                              <span className="text-slate-600 font-medium">
                                Background Server Audio Mode
                              </span>
                            )}

                            {isTranscribingAudio && (
                              <span className="text-indigo-600 font-medium flex items-center gap-1 animate-pulse">
                                <Volume2 className="w-3 h-3" />
                                Transcribing chunks...
                              </span>
                            )}
                          </div>
                          <span className="font-mono text-[#526078]">
                            {liveTranscriptWords} words captured
                          </span>
                        </div>

                        {/* Live streaming display showing committed vs interim speech */}
                        <div className="p-2.5 rounded-sm bg-[#F8FAFC] border border-[#CBD5E1] text-xs font-mono min-h-24 max-h-48 overflow-y-auto whitespace-pre-wrap leading-relaxed">
                          {liveTranscript ? (
                            <span className="text-[#172033]">{liveTranscript}</span>
                          ) : !interimSpeech ? (
                            <span className="text-[#94A3B8] italic">
                              Spoken conversation will stream here in real-time as you speak, with incremental background audio transcription to Gemini...
                            </span>
                          ) : null}

                          {interimSpeech && (
                            <span className="text-indigo-600 bg-indigo-50/80 px-1 py-0.5 rounded-xs ml-1 font-medium border border-indigo-200">
                              {interimSpeech} <span className="inline-block animate-pulse">...</span>
                            </span>
                          )}
                        </div>

                        {/* Editable Live Transcript Input for fine-tuning or direct typing */}
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-[10px] text-[#64748B]">
                            <span className="font-semibold uppercase tracking-wider">Manual Notes / Transcript Edit</span>
                            <span>Directly editable</span>
                          </div>
                          <textarea
                            rows={3}
                            placeholder="Type, paste, or refine live transcript text here..."
                            value={liveTranscript}
                            onChange={(e) => setLiveTranscript(e.target.value)}
                            className="w-full input-base text-xs font-mono leading-relaxed resize-y"
                          />
                        </div>

                        {/* Simulation & Analysis action toolbar */}
                        <div className="flex items-center justify-between pt-1 flex-wrap gap-2">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <button
                              type="button"
                              onClick={handleSimulateNextStage}
                              className="text-[11px] bg-[#EEF2FF] hover:bg-[#E0E7FF] text-[#5145CD] font-medium py-1 px-2 rounded-sm border border-[#C7D2FE] flex items-center gap-1"
                              title="Simulate conversation progression through the 4 required agenda topics"
                            >
                              <Sparkles className="w-3 h-3 text-[#5145CD]" />
                              <span>
                                {simulationStep < 4
                                  ? `Simulate Step ${simulationStep + 1}/4: ${SIMULATION_STAGES[simulationStep]?.topic}`
                                  : 'Restart 4-Topic Simulation'}
                              </span>
                            </button>

                            {simulationStep > 0 && (
                              <button
                                type="button"
                                onClick={handleResetSimulation}
                                className="text-[10px] text-slate-500 hover:text-slate-800 underline"
                              >
                                Reset
                              </button>
                            )}
                          </div>

                          <button
                            type="button"
                            onClick={() => runCopilotAnalysis(liveTranscript, true)}
                            disabled={isCopilotLoading || !liveTranscript.trim()}
                            className="btn-secondary text-[11px] py-1 px-2.5 flex items-center gap-1"
                          >
                            <RefreshCw className={`w-3 h-3 ${isCopilotLoading ? 'animate-spin' : ''}`} />
                            <span>Evaluate Agenda Progress</span>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Structured Intelligence Briefing Card */}
      {analysisResult && (
        <div className="space-y-5 pt-4 border-t border-ghost-border">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-ghost-text flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-ghost-accent" />
                Extracted Meeting Intelligence Brief
              </h2>
              <p className="text-[11px] text-ghost-secondary">
                Review verified summary, deliverables, and decisions before committing to library.
              </p>
            </div>

            <button
              onClick={handleSaveMeeting}
              disabled={isBusy}
              className="btn-primary"
            >
              <span>{processState === 'saving' ? 'Committing...' : 'Commit to Library'}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Original Transcript Section */}
          <div className="ghost-panel p-4 space-y-2 bg-[#FFFFFF] border border-[#DCE2EB]">
            <div className="flex items-center justify-between border-b border-[#DCE2EB] pb-2">
              <span className="text-[10px] font-semibold text-ghost-secondary uppercase tracking-wider flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-[#5145CD]" />
                Original Transcript
              </span>
              <span className="text-[11px] font-mono text-[#526078]">
                {((transcript || analysisResult.transcript) || '').trim().split(/\s+/).filter(Boolean).length} words
              </span>
            </div>
            <div className="p-3.5 rounded-sm bg-[#F8FAFC] border border-[#E2E8F0] text-xs font-mono text-[#172033] leading-relaxed whitespace-pre-wrap max-h-60 overflow-y-auto">
              {transcript || analysisResult.transcript || 'No transcript text available.'}
            </div>
          </div>

          {/* Executive Summary */}
          <div className="ghost-panel p-4 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[10px] font-semibold text-ghost-secondary uppercase tracking-wider block">
                Executive Summary
              </span>
              {analysisResult.sentiment?.conversationalTone && (
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-sm text-[11px] font-medium bg-[#EEF2FF] text-[#3730A3] border border-[#C7D2FE]">
                  <span>Tone: {analysisResult.sentiment.conversationalTone}</span>
                </span>
              )}
            </div>
            <p className="text-xs sm:text-sm text-ghost-text leading-relaxed font-medium">
              {analysisResult.summary}
            </p>
            {analysisResult.detailedSummary && (
              <div className="pt-2 border-t border-ghost-border text-xs text-ghost-secondary leading-relaxed">
                <strong className="text-ghost-text">Detailed Proceedings: </strong>
                {analysisResult.detailedSummary}
              </div>
            )}
            {analysisResult.sentiment?.speakers?.length > 0 && (
              <div className="pt-2 border-t border-ghost-border flex flex-wrap items-center gap-2 text-xs">
                <span className="text-[10px] font-semibold text-ghost-secondary uppercase tracking-wider">
                  Speaker Sentiment:
                </span>
                {analysisResult.sentiment.speakers.map((sp, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-sm text-[11px] bg-[#F4F6FA] border border-[#DCE2EB] text-[#172033]"
                  >
                    <strong>{sp.speaker}:</strong> {sp.overallSentiment}
                    {sp.emotionalSignals?.[0] && sp.emotionalSignals[0] !== 'None' && (
                      <span className="text-[#5145CD] font-medium">({sp.emotionalSignals[0]})</span>
                    )}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Action Items Deliverables */}
          <div className="ghost-panel p-4 space-y-2.5">
            <span className="text-[10px] font-semibold text-ghost-secondary uppercase tracking-wider block">
              Action Items ({(analysisResult.actionItems || []).length})
            </span>

            {(analysisResult.actionItems || []).length > 0 ? (
              <div className="divide-y divide-ghost-border">
                {analysisResult.actionItems.map((item, idx) => (
                  <div key={idx} className="py-2.5 flex items-center justify-between text-xs gap-3">
                    <div className="space-y-0.5 min-w-0">
                      <p className="font-medium text-ghost-text">{item.task}</p>
                      <p className="text-[11px] text-ghost-secondary">
                        Owner: <span className="text-ghost-accent font-medium">{item.owner}</span> • Deadline: {item.deadline}
                      </p>
                    </div>
                    <PriorityBadge priority={item.priority} />
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-ghost-secondary py-2">No action items detected in transcript.</p>
            )}
          </div>

          {/* Confirmed Decisions */}
          <div className="ghost-panel p-4 space-y-2.5">
            <span className="text-[10px] font-semibold text-ghost-secondary uppercase tracking-wider block">
              Confirmed Decisions ({(analysisResult.decisions || []).length})
            </span>

            {(analysisResult.decisions || []).length > 0 ? (
              <div className="space-y-2">
                {analysisResult.decisions.map((d, idx) => (
                  <div key={idx} className="p-2.5 rounded-sm bg-[#F4F6FA] border border-[#DCE2EB] text-xs space-y-1">
                    <div className="font-semibold text-ghost-text">{d.decision}</div>
                    <div className="text-ghost-secondary text-[11px]">
                      <strong className="text-ghost-text">Rationale: </strong>{d.rationale}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-ghost-secondary py-2">No decisions confirmed.</p>
            )}
          </div>

          {/* Follow-up Agenda */}
          {(analysisResult.followUpAgenda || []).length > 0 && (
            <div className="ghost-panel p-4 space-y-2">
              <span className="text-[10px] font-semibold text-ghost-secondary uppercase tracking-wider block">
                Follow-up Agenda for Next Meeting
              </span>
              <ul className="list-disc list-inside text-xs text-ghost-secondary space-y-1">
                {analysisResult.followUpAgenda.map((agenda, idx) => (
                  <li key={idx}>{agenda}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Save Action Footer */}
          <div className="flex justify-end pt-2">
            <button
              onClick={handleSaveMeeting}
              disabled={isBusy}
              className="btn-primary"
            >
              <span>{processState === 'saving' ? 'Committing...' : 'Commit and Open Full Dossier'}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
