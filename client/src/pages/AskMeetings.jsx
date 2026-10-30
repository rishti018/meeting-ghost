import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  MessageSquareQuote,
  Send,
  Quote,
  ExternalLink,
  AlertCircle,
  HelpCircle,
  RefreshCw,
  Info
} from 'lucide-react';
import { api } from '../api/client';

const SUGGESTED_QUESTIONS = [
  'Who owns the backend development tasks?',
  'What decisions were made?',
  'Which tasks are still pending?',
  'What should be discussed in the next meeting?',
  'Who is responsible for the UI design and what is the deadline?',
];

export function AskMeetings() {
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [qaHistory, setQaHistory] = useState([]);
  const [error, setError] = useState(null);

  const handleAsk = async (queryToAsk) => {
    const q = (queryToAsk || question).trim();
    if (!q) return;

    try {
      setLoading(true);
      setError(null);
      setQuestion('');

      const res = await api.askQuestion(q);

      const newEntry = {
        id: Date.now(),
        question: q,
        answer: res.answer,
        citations: res.citations || [],
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      setQaHistory((prev) => [newEntry, ...prev]);
    } catch (err) {
      setError(err.message || 'Failed to query meetings');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleAsk();
    }
  };

  return (
    <div className="space-y-5 max-w-3xl mx-auto pb-12">
      {/* Header */}
      <div className="pb-1">
        <h1 className="text-lg font-semibold text-[#172033] tracking-tight">
          Query Meeting Archives
        </h1>
        <p className="text-xs text-[#526078] mt-0.5">
          Ask questions in natural language. Answers are strictly bounded by recorded meeting proceedings and citations.
        </p>
      </div>

      {/* Suggested Starter Chips */}
      <div className="space-y-1.5">
        <span className="text-[10px] font-semibold text-[#526078] uppercase tracking-wider block">
          Suggested Queries
        </span>
        <div className="flex flex-wrap gap-1.5">
          {SUGGESTED_QUESTIONS.map((sq, idx) => (
            <button
              key={idx}
              onClick={() => {
                setQuestion(sq);
                handleAsk(sq);
              }}
              disabled={loading}
              className="text-left px-2.5 py-1.5 rounded-sm bg-[#FFFFFF] hover:bg-[#F4F6FA] text-[11px] text-[#172033] font-medium border border-[#DCE2EB] hover:border-[#C2CBDA] transition-colors disabled:opacity-50 shadow-xs"
            >
              "{sq}"
            </button>
          ))}
        </div>
      </div>

      {/* Query Input Bar */}
      <div className="ghost-panel p-2 shadow-xs bg-[#FFFFFF] border border-[#DCE2EB]">
        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder="Ask anything about your meetings (e.g. Who owns backend development?)..."
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={loading}
            className="flex-1 px-2.5 py-1.5 bg-transparent text-xs text-[#172033] placeholder-[#526078] placeholder:opacity-90 focus:outline-none font-medium"
          />
          <button
            onClick={() => handleAsk()}
            disabled={loading || !question.trim()}
            className="btn-primary py-1 px-3 text-xs"
          >
            {loading ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Send className="w-3.5 h-3.5" />
            )}
            <span>{loading ? 'Searching...' : 'Ask'}</span>
          </button>
        </div>
      </div>

      {/* Grounding Notice */}
      <div className="flex items-center gap-1.5 text-[11px] text-[#526078] px-1 font-medium">
        <Info className="w-3.5 h-3.5 shrink-0 text-[#5145CD]" />
        <span>Answers are strictly limited to saved records. Unrecorded facts report insufficient evidence.</span>
      </div>

      {/* Error state */}
      {error && (
        <div className="ghost-panel p-3 border-ghost-brickBorder bg-ghost-brickBg text-ghost-brick text-xs flex items-center space-x-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Q&A Message Stream */}
      <div className="space-y-4 pt-1">
        {qaHistory.length === 0 && !loading && (
          <div className="ghost-panel p-8 text-center text-xs text-[#526078] space-y-1.5 border-dashed bg-[#FFFFFF] border border-[#DCE2EB]">
            <HelpCircle className="w-5 h-5 text-[#5145CD] mx-auto" />
            <p className="font-semibold text-[#172033] text-sm">No queries in this session</p>
            <p className="text-[11px] text-[#526078]">Select a suggested query above or type a question to inspect grounded findings.</p>
          </div>
        )}

        {loading && (
          <div className="ghost-panel p-4 flex items-center justify-center space-x-2 text-xs text-ghost-secondary animate-pulse">
            <RefreshCw className="w-3.5 h-3.5 animate-spin text-ghost-accent" />
            <span>Scanning stored meetings and transcripts...</span>
          </div>
        )}

        {qaHistory.map((item) => (
          <div key={item.id} className="ghost-panel p-4 space-y-3">
            {/* Question */}
            <div className="flex items-start justify-between gap-3 border-b border-ghost-border pb-2.5">
              <span className="text-xs font-semibold text-[#172033]">
                {item.question}
              </span>
              <span className="text-[11px] text-[#172033] font-mono font-medium shrink-0">
                {item.timestamp}
              </span>
            </div>

            {/* Answer */}
            <div className="text-xs text-[#172033] leading-relaxed whitespace-pre-line font-normal">
              {item.answer}
            </div>

            {/* Citations */}
            {item.citations && item.citations.length > 0 && (
              <div className="pt-2.5 border-t border-ghost-border space-y-2">
                <span className="text-[10px] font-semibold text-[#526078] uppercase tracking-wider flex items-center gap-1">
                  <Quote className="w-3 h-3 text-[#5145CD]" />
                  Verbatim Transcript Evidence ({item.citations.length})
                </span>

                <div className="space-y-1.5">
                  {item.citations.map((cite, cIdx) => (
                    <div
                      key={cIdx}
                      className="p-2.5 rounded-sm bg-[#F4F6FA] border border-[#DCE2EB] text-xs space-y-1"
                    >
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-[#172033] font-semibold">
                          Brief: {cite.meetingTitle}
                        </span>
                        {cite.meetingId && (
                          <Link
                            to={`/meetings/${cite.meetingId}`}
                            className="text-[#5145CD] hover:underline inline-flex items-center gap-1 font-semibold"
                          >
                            <span>Open Dossier</span>
                            <ExternalLink className="w-3 h-3" />
                          </Link>
                        )}
                      </div>

                      <p className="font-mono text-[11px] text-[#172033] bg-[#FFFFFF] p-1.5 rounded-sm border border-[#DCE2EB]">
                        "{cite.excerpt}"
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
