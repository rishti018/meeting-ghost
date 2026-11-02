import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Scale,
  CalendarDays,
  FileText,
  Trash2,
  Share2,
  Check,
  AlertCircle,
  X,
  User,
  Linkedin,
  Target,
  ListChecks,
  ClipboardList,
  ExternalLink,
  Sparkles,
  Heart,
  Smile,
  ShieldAlert,
  HelpCircle,
  MessageSquare,
  Activity,
} from 'lucide-react';
import { api } from '../api/client';
import { PriorityBadge } from '../components/StatusBadge';
import { SkeletonList } from '../components/SkeletonLoader';
import { MinutesOfMeetingView } from '../components/MinutesOfMeetingView';
import { formatDate } from '../utils/formatters';

export function MeetingDetail() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [meeting, setMeeting] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showTranscript, setShowTranscript] = useState(false);
  const [updatingTaskId, setUpdatingTaskId] = useState(null);
  const [copied, setCopied] = useState(false);
  const [isGeneratingMom, setIsGeneratingMom] = useState(false);

  useEffect(() => {
    let mounted = true;
    const fetchDetail = async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await api.getMeeting(id);
        if (mounted) setMeeting(res.data);
      } catch (err) {
        if (mounted) setError(err.message || 'Failed to load meeting details');
      } finally {
        if (mounted) setLoading(false);
      }
    };

    fetchDetail();
    return () => {
      mounted = false;
    };
  }, [id]);

  const handleStatusChange = async (taskId, newStatus) => {
    try {
      setUpdatingTaskId(taskId);
      const res = await api.updateTask(taskId, { status: newStatus });
      setMeeting(prev => ({
        ...prev,
        actionItems: (prev.actionItems || []).map(task =>
          task.id === taskId ? { ...task, ...(res?.data || {}), status: newStatus } : task
        ),
      }));
    } catch (err) {
      alert('Failed to update task status: ' + err.message);
      const res = await api.getMeeting(id);
      if (res && res.data) setMeeting(res.data);
    } finally {
      setUpdatingTaskId(null);
    }
  };

  const handleDeleteMeeting = async () => {
    if (!window.confirm(`Delete "${meeting.title}" and its deliverables?`)) return;

    try {
      await api.deleteMeeting(id);
      navigate('/meetings');
    } catch (err) {
      alert('Failed to delete meeting: ' + err.message);
    }
  };

  const handleCopySummary = () => {
    if (!meeting) return;
    const text = `# ${meeting.title}\nDate: ${meeting.date}\nDepartment: ${meeting.department}\n\n## Executive Summary\n${meeting.summary}\n\n## Action Items\n${(meeting.actionItems || []).map(a => `- [${a.status}] ${a.owner}: ${a.task} (Deadline: ${a.deadline}, Priority: ${a.priority})`).join('\n')}\n\n## Decisions\n${(meeting.decisions || []).map(d => `- ${d.decision} (Rationale: ${d.rationale})`).join('\n')}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleGenerateMom = async () => {
    try {
      setIsGeneratingMom(true);
      const res = await api.generateMom(id);
      if (res?.data) {
        // Automatically save the generated MoM baseline
        const saveRes = await api.saveMom(id, res.data, false);
        const updatedMeeting = saveRes?.data;
        if (updatedMeeting) {
          setMeeting(updatedMeeting);
          return updatedMeeting.mom;
        } else {
          setMeeting(prev => ({ ...prev, mom: res.data }));
          return res.data;
        }
      }
    } catch (err) {
      alert('Failed to generate Minutes of Meeting: ' + (err.message || 'Error occurred'));
    } finally {
      setIsGeneratingMom(false);
    }
  };

  const handleSaveMom = async (momData, isEdited = true) => {
    try {
      const res = await api.saveMom(id, momData, isEdited);
      if (res?.data) {
        setMeeting(res.data);
        return res.data;
      }
    } catch (err) {
      throw err;
    }
  };

  if (loading) {
    return (
      <div className="space-y-5 max-w-4xl mx-auto">
        <SkeletonList rows={8} />
      </div>
    );
  }

  if (error || !meeting) {
    return (
      <div className="ghost-panel p-8 text-center max-w-md mx-auto my-12">
        <AlertCircle className="w-8 h-8 text-ghost-brick mx-auto mb-3" />
        <h3 className="text-sm font-semibold text-ghost-text mb-1">Meeting Brief Not Found</h3>
        <p className="text-xs text-ghost-secondary mb-5">{error || 'This meeting record could not be loaded.'}</p>
        <Link to="/meetings" className="btn-secondary">
          Return to Library
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-12">
      {/* Top Breadcrumb & Action Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-ghost-border pb-4">
        <Link
          to="/meetings"
          className="inline-flex items-center text-xs text-[#172033] hover:text-[#5145CD] font-medium transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5 mr-1" />
          <span>Meetings Library</span>
        </Link>

        <div className="flex items-center flex-wrap gap-2">
          {!meeting.mom ? (
            <button
              onClick={handleGenerateMom}
              disabled={isGeneratingMom}
              className="btn-primary text-xs flex items-center gap-1.5 shadow-xs"
              title="Generate formal Minutes of Meeting"
            >
              <Sparkles className="w-3.5 h-3.5 text-[#C7D2FE]" />
              <span>{isGeneratingMom ? 'Generating MoM...' : 'Generate MoM'}</span>
            </button>
          ) : (
            <a
              href="#mom-section"
              className="btn-secondary text-xs flex items-center gap-1.5"
              title="View Minutes of Meeting"
            >
              <FileText className="w-3.5 h-3.5 text-[#5145CD]" />
              <span>View MoM</span>
            </a>
          )}

          <button
            onClick={() => setShowTranscript(true)}
            className="btn-secondary text-xs"
          >
            <FileText className="w-3.5 h-3.5 text-ghost-secondary" />
            <span>Transcript Evidence</span>
          </button>

          <button
            onClick={handleCopySummary}
            className="btn-secondary text-xs"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-ghost-accent" /> : <Share2 className="w-3.5 h-3.5 text-ghost-secondary" />}
            <span>{copied ? 'Copied' : 'Export Brief'}</span>
          </button>

          <button
            onClick={handleDeleteMeeting}
            className="btn-destructive text-xs"
            title="Delete meeting"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Briefing Header */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="px-2 py-0.5 rounded-sm text-[11px] font-medium bg-[#EEF2FF] text-[#3730A3] border border-[#C7D2FE]">
            {meeting.department || 'General'}
          </span>
          <span className="flex items-center gap-1 text-[11px] font-mono text-[#172033] font-medium">
            <Calendar className="w-3.5 h-3.5 text-[#526078]" />
            {formatDate(meeting.date)}
          </span>
          {meeting.isDemo && (
            <span className="px-1.5 py-0.5 rounded-sm text-[10px] font-medium bg-[#EEF2FF] text-[#3730A3] border border-[#C7D2FE]">
              Sample Dataset
            </span>
          )}
        </div>

        <h1 className="text-xl sm:text-2xl font-semibold text-ghost-text tracking-tight">
          {meeting.title}
        </h1>
      </div>

      {/* Meeting Preparation & Context */}
      {meeting.preparation && (meeting.preparation.personName || meeting.preparation.purpose || (meeting.preparation.agenda && meeting.preparation.agenda.length > 0) || meeting.preparation.desiredOutcome) && (
        <div className="ghost-panel p-5 space-y-4 bg-[#FFFFFF] border border-[#DCE2EB]">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#DCE2EB] pb-3">
            <span className="text-[10px] font-semibold text-ghost-secondary uppercase tracking-wider flex items-center gap-1.5">
              <ClipboardList className="w-3.5 h-3.5 text-[#5145CD]" />
              Meeting Preparation & Stated Objectives
            </span>
            {meeting.preparation.personName && (
              <div className="flex flex-wrap items-center gap-2 text-xs text-ghost-text">
                <span className="flex items-center gap-1.5 font-medium">
                  <User className="w-3.5 h-3.5 text-[#526078]" />
                  <span>Meeting with: <strong className="text-[#172033]">{meeting.preparation.personName}</strong></span>
                </span>
                {meeting.preparation.linkedinUrl && (
                  <a
                    href={meeting.preparation.linkedinUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] text-[#0A66C2] hover:underline font-medium ml-1"
                    title="Open LinkedIn Profile"
                  >
                    <Linkedin className="w-3 h-3" />
                    <span>LinkedIn</span>
                    <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                )}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            {meeting.preparation.purpose && (
              <div className="p-3 rounded-sm bg-[#F8FAFC] border border-[#E2E8F0] space-y-1">
                <span className="text-[10px] font-semibold text-[#526078] uppercase tracking-wider flex items-center gap-1">
                  <Target className="w-3 h-3 text-[#5145CD]" />
                  Meeting Purpose
                </span>
                <p className="text-[#172033] font-medium leading-relaxed">
                  {meeting.preparation.purpose}
                </p>
              </div>
            )}

            {meeting.preparation.desiredOutcome && (
              <div className="p-3 rounded-sm bg-[#F8FAFC] border border-[#E2E8F0] space-y-1">
                <span className="text-[10px] font-semibold text-[#526078] uppercase tracking-wider flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                  Desired Outcome
                </span>
                <p className="text-[#172033] font-medium leading-relaxed">
                  {meeting.preparation.desiredOutcome}
                </p>
              </div>
            )}
          </div>

          {meeting.preparation.agenda && meeting.preparation.agenda.length > 0 && (
            <div className="pt-1 space-y-2">
              <span className="text-[10px] font-semibold text-[#526078] uppercase tracking-wider flex items-center gap-1">
                <ListChecks className="w-3 h-3 text-[#5145CD]" />
                Planned Discussion Agenda ({meeting.preparation.agenda.length} Topics)
              </span>
              <div className="flex flex-wrap gap-1.5">
                {meeting.preparation.agenda.map((topic, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-sm text-xs bg-[#F4F6FA] text-[#172033] border border-[#DCE2EB] font-medium"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-[#5145CD]" />
                    {topic}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Executive Summary Section */}
      <div className="ghost-panel p-5 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-ghost-border pb-2.5">
          <span className="text-[10px] font-semibold text-ghost-secondary uppercase tracking-wider block">
            Executive Summary
          </span>
          {meeting.sentiment?.conversationalTone && (
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-sm text-[11px] font-medium bg-[#EEF2FF] text-[#3730A3] border border-[#C7D2FE]">
                <Activity className="w-3 h-3 text-[#5145CD]" />
                <span>Tone: <strong>{meeting.sentiment.conversationalTone}</strong></span>
              </span>
              {meeting.sentiment.distribution && (
                <div className="hidden md:flex items-center gap-1 text-[10px] font-mono">
                  <span className="px-1.5 py-0.5 rounded-xs bg-emerald-50 text-emerald-700 border border-emerald-200">
                    Pos {meeting.sentiment.distribution.positive}%
                  </span>
                  <span className="px-1.5 py-0.5 rounded-xs bg-slate-100 text-slate-700 border border-slate-200">
                    Neu {meeting.sentiment.distribution.neutral}%
                  </span>
                  {meeting.sentiment.distribution.negative > 0 && (
                    <span className="px-1.5 py-0.5 rounded-xs bg-rose-50 text-rose-700 border border-rose-200">
                      Neg {meeting.sentiment.distribution.negative}%
                    </span>
                  )}
                  {meeting.sentiment.distribution.mixed > 0 && (
                    <span className="px-1.5 py-0.5 rounded-xs bg-indigo-50 text-indigo-700 border border-indigo-200">
                      Mix {meeting.sentiment.distribution.mixed}%
                    </span>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <p className="text-xs sm:text-sm text-ghost-text leading-relaxed font-medium">
          {meeting.summary}
        </p>

        {meeting.detailedSummary && meeting.detailedSummary !== meeting.summary && (
          <div className="pt-3 border-t border-ghost-border text-xs text-ghost-secondary leading-relaxed space-y-1">
            <span className="font-semibold text-ghost-text block text-[10px] uppercase tracking-wider">
              Detailed Proceedings
            </span>
            <p>{meeting.detailedSummary}</p>
          </div>
        )}
      </div>

      {/* Key Discussion Points */}
      {(meeting.keyPoints || []).length > 0 && (
        <div className="ghost-panel p-5 space-y-3">
          <span className="text-[10px] font-semibold text-ghost-secondary uppercase tracking-wider block">
            Key Discussion Points
          </span>
          <ul className="space-y-2">
            {meeting.keyPoints.map((point, index) => (
              <li
                key={index}
                className="text-xs text-ghost-text flex items-start gap-2 leading-relaxed"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-ghost-accent mt-1.5 shrink-0" />
                <span>{point}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Speaker Sentiment & Contextual Emotion Dynamics */}
      {meeting.sentiment && (
        <div className="ghost-panel p-5 space-y-4 bg-[#FFFFFF] border border-[#DCE2EB]">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#DCE2EB] pb-3">
            <div>
              <span className="text-xs font-semibold text-[#172033] uppercase tracking-wider flex items-center gap-1.5">
                <Heart className="w-3.5 h-3.5 text-[#5145CD]" />
                Speaker Sentiment & Emotion-Aware Intelligence
              </span>
              <p className="text-[11px] text-[#526078] mt-0.5">
                Dialogue-grounded speaker dynamics, sentiment shifts, and contextual emotional signals
              </p>
            </div>
            {meeting.sentiment.shifts && meeting.sentiment.shifts.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                {meeting.sentiment.shifts.map((sh, sIdx) => (
                  <span
                    key={sIdx}
                    className="text-[11px] text-[#526078] bg-[#F4F6FA] px-2 py-0.5 rounded-sm border border-[#DCE2EB]"
                    title={sh.trigger ? `Trigger: ${sh.trigger}` : undefined}
                  >
                    <strong>{sh.fromStage} → {sh.toStage}:</strong> {sh.shiftDescription}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Speaker-wise Breakdown */}
          {meeting.sentiment.speakers && meeting.sentiment.speakers.length > 0 && (
            <div className="space-y-2">
              <span className="text-[10px] font-semibold text-[#526078] uppercase tracking-wider block">
                Speaker Sentiment Breakdown ({meeting.sentiment.speakers.length} Speakers)
              </span>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {meeting.sentiment.speakers.map((spk, idx) => {
                  const sentimentColor =
                    spk.overallSentiment === 'Positive'
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                      : spk.overallSentiment === 'Negative'
                      ? 'bg-rose-50 text-rose-800 border-rose-200'
                      : spk.overallSentiment === 'Mixed'
                      ? 'bg-indigo-50 text-indigo-800 border-indigo-200'
                      : 'bg-slate-100 text-slate-800 border-slate-200';

                  const speakerObs = (meeting.sentiment.observations || []).filter(
                    o => o.speaker === spk.speaker && o.quote
                  );
                  const topObs = speakerObs[0];

                  return (
                    <div
                      key={idx}
                      className="p-3.5 rounded-sm bg-[#F8FAFC] border border-[#E2E8F0] space-y-2 text-xs"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-[#172033] flex items-center gap-1.5">
                          <User className="w-3 h-3 text-[#526078]" />
                          {spk.speaker}
                        </span>
                        <span className={`px-2 py-0.5 rounded-sm text-[10px] font-semibold uppercase tracking-wider border ${sentimentColor}`}>
                          {spk.overallSentiment}
                        </span>
                      </div>

                      <p className="text-[#526078] text-[11px] leading-relaxed">
                        {spk.summary}
                      </p>

                      {spk.emotionalSignals && spk.emotionalSignals.length > 0 && spk.emotionalSignals[0] !== 'None' && (
                        <div className="flex flex-wrap items-center gap-1 pt-1">
                          {spk.emotionalSignals.map((signal, sIdx) => {
                            let badgeStyle = 'bg-slate-100 text-slate-700 border-slate-200';
                            if (signal === 'Enthusiasm') badgeStyle = 'bg-purple-50 text-purple-700 border-purple-200';
                            if (signal === 'Confidence') badgeStyle = 'bg-emerald-50 text-emerald-700 border-emerald-200';
                            if (signal === 'Uncertainty') badgeStyle = 'bg-amber-50 text-amber-700 border-amber-200';
                            if (signal === 'Frustration') badgeStyle = 'bg-rose-50 text-rose-700 border-rose-200';
                            if (signal === 'Concern') badgeStyle = 'bg-orange-50 text-orange-800 border-orange-200';
                            if (signal === 'Disagreement') badgeStyle = 'bg-red-50 text-red-700 border-red-200';

                            return (
                              <span
                                key={sIdx}
                                className={`px-1.5 py-0.5 rounded-xs text-[10px] font-medium border ${badgeStyle}`}
                              >
                                {signal}
                              </span>
                            );
                          })}
                        </div>
                      )}

                      {/* Grounded Evidence Citation */}
                      {topObs && (
                        <div className="pt-1.5 border-t border-[#E2E8F0]">
                          <span className="text-[10px] text-[#526078] font-mono block">
                            Evidence {topObs.segment && `(${topObs.segment})`} • Confidence: {topObs.confidence || 'Medium'}
                          </span>
                          <blockquote className="text-[11px] italic text-[#172033] border-l-2 border-[#5145CD] pl-2 mt-0.5">
                            "{topObs.quote}"
                          </blockquote>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Important Moments */}
          {meeting.sentiment.keyMoments && meeting.sentiment.keyMoments.length > 0 && (
            <div className="pt-2 space-y-2 border-t border-[#DCE2EB]">
              <span className="text-[10px] font-semibold text-[#526078] uppercase tracking-wider block">
                Key Discussion Moments & Divergence ({meeting.sentiment.keyMoments.length} Captured)
              </span>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                {meeting.sentiment.keyMoments.slice(0, 6).map((km, idx) => {
                  let badge = 'bg-slate-100 text-slate-700 border-slate-200';
                  if (km.type === 'Agreement') badge = 'bg-emerald-50 text-emerald-700 border-emerald-200';
                  if (km.type === 'Concern') badge = 'bg-amber-50 text-amber-800 border-amber-300';
                  if (km.type === 'Uncertainty') badge = 'bg-indigo-50 text-indigo-700 border-indigo-200';
                  if (km.type === 'Disagreement') badge = 'bg-rose-50 text-rose-700 border-rose-200';

                  return (
                    <div
                      key={idx}
                      className="p-2.5 rounded-sm bg-[#F4F6FA] border border-[#DCE2EB] text-xs space-y-1"
                    >
                      <div className="flex items-center justify-between text-[10px]">
                        <span className={`px-1.5 py-0.5 rounded-xs font-semibold uppercase tracking-wider border ${badge}`}>
                          {km.type}
                        </span>
                        <span className="font-mono text-[#526078]">{km.speaker} {km.segment && `• ${km.segment}`}</span>
                      </div>
                      <blockquote className="italic text-[#172033] border-l-2 border-[#C7D2FE] pl-2 text-[11px] my-1">
                        "{km.quote}"
                      </blockquote>
                      <p className="text-[11px] text-[#526078]">{km.context}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Emotion-Aware AI Suggestions */}
          {meeting.sentiment.suggestions && meeting.sentiment.suggestions.length > 0 && (
            <div className="pt-2 space-y-2 border-t border-[#DCE2EB]">
              <span className="text-[10px] font-semibold text-[#526078] uppercase tracking-wider flex items-center gap-1">
                <HelpCircle className="w-3 h-3 text-[#5145CD]" />
                Emotion-Aware Follow-Up Suggestions ({meeting.sentiment.suggestions.length})
              </span>
              <div className="space-y-2">
                {meeting.sentiment.suggestions.map((sug, idx) => (
                  <div
                    key={idx}
                    className="p-3 rounded-sm bg-[#EEF2FF]/40 border border-[#C7D2FE] text-xs space-y-1"
                  >
                    <div className="font-semibold text-[#1E1B4B] flex items-start gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#5145CD] mt-1.5 shrink-0" />
                      <span>{sug.recommendedAction}</span>
                    </div>
                    {sug.trigger && (
                      <p className="text-[11px] text-[#4338CA] pl-3">
                        <strong>Observed Context: </strong>{sug.trigger}
                      </p>
                    )}
                    {sug.rationale && (
                      <p className="text-[11px] text-[#526078] pl-3 leading-relaxed">
                        <strong>Rationale: </strong>{sug.rationale}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* AI Minutes of Meeting (MoM) Section */}
      <div id="mom-section">
        <MinutesOfMeetingView
          meetingId={meeting.id || id}
          meetingTitle={meeting.title}
          initialMom={meeting.mom}
          onGenerateMom={handleGenerateMom}
          onSaveMom={handleSaveMom}
          isGenerating={isGeneratingMom}
        />
      </div>

      {/* Action Deliverables Work Queue */}
      <div className="ghost-panel overflow-hidden bg-[#FFFFFF] border border-[#DCE2EB]">
        <div className="p-3.5 border-b border-[#DCE2EB] flex items-center justify-between bg-[#FFFFFF]">
          <div>
            <span className="text-xs font-semibold text-[#172033] uppercase tracking-wider block">
              Action Items & Assigned Deliverables
            </span>
            <p className="text-[11px] text-[#526078]">
              Commitments with assigned owners, deadlines, and live status updates
            </p>
          </div>
          <span className="counter-badge">
            {(meeting.actionItems || []).length} Deliverables
          </span>
        </div>

        {(meeting.actionItems || []).length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-[#DCE2EB] text-[#526078] uppercase text-[10px] tracking-wider bg-[#F4F6FA]">
                  <th className="py-2.5 px-3.5">Deliverable</th>
                  <th className="py-2.5 px-3.5">Owner</th>
                  <th className="py-2.5 px-3.5">Deadline</th>
                  <th className="py-2.5 px-3.5">Priority</th>
                  <th className="py-2.5 px-3.5 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#DCE2EB]">
                {meeting.actionItems.map((item) => (
                  <tr key={item.id} className="hover:bg-[#F4F6FA] transition-colors">
                    <td className="py-3 px-3.5 font-medium text-[#172033]">
                      {item.task}
                    </td>
                    <td className="py-3 px-3.5">
                      <span className="px-2 py-0.5 rounded-sm bg-[#F4F6FA] text-ghost-text border border-[#DCE2EB] font-medium text-[11px]">
                        {item.owner || 'Unassigned'}
                      </span>
                    </td>
                    <td className="py-3 px-3.5 text-[#172033] font-mono text-[11px] font-medium">
                      {item.deadline || 'Not specified'}
                    </td>
                    <td className="py-3 px-3.5">
                      <PriorityBadge priority={item.priority} />
                    </td>
                    <td className="py-3 px-3.5 text-right">
                      <select
                        value={item.status}
                        onChange={(e) => handleStatusChange(item.id, e.target.value)}
                        disabled={updatingTaskId === item.id}
                        className="input-base text-xs w-auto py-1 cursor-pointer"
                      >
                        <option value="Pending">Pending</option>
                        <option value="In Progress">In Progress</option>
                        <option value="Completed">Completed</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-6 text-center text-xs text-ghost-secondary">
            No action items identified in this meeting.
          </div>
        )}
      </div>

      {/* Decisions & Follow-up Agenda */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Confirmed Decisions */}
        <div className="ghost-panel p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold text-ghost-secondary uppercase tracking-wider flex items-center gap-1.5">
              <Scale className="w-3.5 h-3.5 text-ghost-secondary" />
              Confirmed Decisions
            </span>
            <span className="counter-badge text-[10px] py-0.5 px-2">
              {(meeting.decisions || []).length} logged
            </span>
          </div>

          {(meeting.decisions || []).length > 0 ? (
            <div className="space-y-2.5">
              {meeting.decisions.map((dec, i) => (
                <div
                  key={dec.id || i}
                  className="p-3 rounded-sm bg-[#F4F6FA] border border-[#DCE2EB] space-y-1 text-xs"
                >
                  <div className="font-semibold text-ghost-text">
                    {dec.decision}
                  </div>
                  <div className="text-[11px] text-ghost-secondary leading-relaxed">
                    <strong className="text-ghost-text font-medium">Rationale: </strong>
                    {dec.rationale}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-ghost-secondary py-3 text-center">No decisions recorded.</p>
          )}
        </div>

        {/* Follow-up Agenda */}
        <div className="ghost-panel p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold text-ghost-secondary uppercase tracking-wider flex items-center gap-1.5">
              <CalendarDays className="w-3.5 h-3.5 text-ghost-secondary" />
              Follow-up Agenda
            </span>
            <span className="counter-badge text-[10px] py-0.5 px-2">
              {(meeting.followUpAgenda || []).length} items
            </span>
          </div>

          {(meeting.followUpAgenda || []).length > 0 ? (
            <ul className="space-y-2">
              {meeting.followUpAgenda.map((agenda, i) => (
                <li
                  key={i}
                  className="p-2.5 rounded-sm bg-[#F4F6FA] border border-[#DCE2EB] text-xs text-ghost-text flex items-start gap-2"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-ghost-accent mt-1.5 shrink-0" />
                  <span>{agenda}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-ghost-secondary py-3 text-center">No follow-up items scheduled.</p>
          )}
        </div>
      </div>

      {/* Original Transcript Section */}
      <div className="ghost-panel p-5 space-y-3 bg-[#FFFFFF] border border-[#DCE2EB]">
        <div className="flex items-center justify-between border-b border-[#DCE2EB] pb-3">
          <div>
            <span className="text-xs font-semibold text-[#172033] uppercase tracking-wider flex items-center gap-2">
              <FileText className="w-3.5 h-3.5 text-[#5145CD]" />
              Original Transcript
            </span>
            <p className="text-[11px] text-[#526078] mt-0.5">
              Source spoken dialogue and meeting transcript saved with this report
            </p>
          </div>
          <span className="counter-badge text-[11px] font-mono">
            {((meeting.transcript || meeting.rawTranscript) || '').trim().split(/\s+/).filter(Boolean).length} words
          </span>
        </div>
        <div className="p-4 rounded-sm bg-[#F8FAFC] border border-[#E2E8F0] text-xs font-mono text-[#172033] leading-relaxed whitespace-pre-wrap max-h-80 overflow-y-auto">
          {meeting.transcript || meeting.rawTranscript || 'No transcript recorded.'}
        </div>
      </div>

      {/* Verbatim Transcript Modal / Drawer */}
      {showTranscript && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0B101B]/60 backdrop-blur-xs">
          <div className="ghost-panel max-w-2xl w-full max-h-[85vh] flex flex-col overflow-hidden shadow-dropdown border-[#DCE2EB]">
            <div className="p-4 border-b border-ghost-border flex items-center justify-between bg-ghost-surface">
              <div>
                <h3 className="text-xs font-semibold text-ghost-text uppercase tracking-wider flex items-center gap-2">
                  <FileText className="w-3.5 h-3.5 text-ghost-secondary" />
                  Verbatim Transcript Evidence
                </h3>
                <p className="text-[11px] text-ghost-secondary">
                  Source unedited dialogue submitted for analysis
                </p>
              </div>
              <button
                onClick={() => setShowTranscript(false)}
                className="p-1 rounded text-[#172033] hover:text-[#5145CD] hover:bg-ghost-muted"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 overflow-y-auto font-mono text-xs text-[#172033] bg-[#F4F6FA] leading-relaxed whitespace-pre-wrap">
              {meeting.transcript || meeting.rawTranscript || 'No raw transcript recorded.'}
            </div>

            <div className="p-3 border-t border-ghost-border bg-ghost-surface flex justify-end">
              <button
                onClick={() => setShowTranscript(false)}
                className="btn-secondary text-xs"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
