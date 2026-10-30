import React, { useState } from 'react';
import {
  FileText,
  Sparkles,
  Download,
  Printer,
  Pencil,
  Save,
  RotateCcw,
  Plus,
  Trash2,
  CheckCircle2,
  Users,
  Target,
  ListChecks,
  MessageSquare,
  HelpCircle,
  Scale,
  CheckSquare,
  AlertTriangle,
  CalendarDays,
  Clock,
  Building,
  Check,
  X,
  RefreshCw,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { downloadMomPdf } from '../utils/momPdfGenerator';
import { PriorityBadge } from './StatusBadge';

export function MinutesOfMeetingView({
  meetingId,
  meetingTitle,
  initialMom,
  onSaveMom,
  onGenerateMom,
  isGenerating = false,
}) {
  const [mom, setMom] = useState(initialMom || null);
  const [isEditing, setIsEditing] = useState(false);
  const [editDraft, setEditDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [showRegenerateConfirm, setShowRegenerateConfirm] = useState(false);
  const [activeTab, setActiveTab] = useState('document'); // 'document' | 'editor'

  // Sync state if initialMom updates from parent
  React.useEffect(() => {
    if (initialMom) {
      setMom(initialMom);
    }
  }, [initialMom]);

  const handleStartEdit = () => {
    setEditDraft(JSON.parse(JSON.stringify(mom)));
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditDraft(null);
  };

  const handleSaveEdit = async () => {
    if (!editDraft) return;
    try {
      setSaving(true);
      const updated = await onSaveMom(editDraft, true);
      setMom(updated?.mom || editDraft);
      setIsEditing(false);
      setEditDraft(null);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      alert('Failed to save Minutes of Meeting: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleRegenerate = async () => {
    setShowRegenerateConfirm(false);
    try {
      const generated = await onGenerateMom();
      if (generated) {
        setMom(generated);
        setIsEditing(false);
        setEditDraft(null);
      }
    } catch (err) {
      alert('Failed to regenerate Minutes of Meeting: ' + err.message);
    }
  };

  const handleDownloadPdf = () => {
    downloadMomPdf(mom, meetingTitle);
  };

  const handlePrint = () => {
    window.print();
  };

  // Helper for array field editing
  const handleArrayChange = (field, index, value) => {
    setEditDraft(prev => {
      const list = [...(prev[field] || [])];
      list[index] = value;
      return { ...prev, [field]: list };
    });
  };

  const handleAddArrayItem = (field, defaultValue = '') => {
    setEditDraft(prev => ({
      ...prev,
      [field]: [...(prev[field] || []), defaultValue],
    }));
  };

  const handleRemoveArrayItem = (field, index) => {
    setEditDraft(prev => {
      const list = [...(prev[field] || [])];
      list.splice(index, 1);
      return { ...prev, [field]: list };
    });
  };

  // Helper for Q&A editing
  const handleQAChange = (index, key, val) => {
    setEditDraft(prev => {
      const qrs = [...(prev.questionsAndResponses || [])];
      qrs[index] = { ...qrs[index], [key]: val };
      return { ...prev, questionsAndResponses: qrs };
    });
  };

  const handleAddQA = () => {
    setEditDraft(prev => ({
      ...prev,
      questionsAndResponses: [
        ...(prev.questionsAndResponses || []),
        { question: '', response: '', askedBy: 'Not specified' },
      ],
    }));
  };

  const handleRemoveQA = (index) => {
    setEditDraft(prev => {
      const qrs = [...(prev.questionsAndResponses || [])];
      qrs.splice(index, 1);
      return { ...prev, questionsAndResponses: qrs };
    });
  };

  // Helper for Decisions editing
  const handleDecisionChange = (index, key, val) => {
    setEditDraft(prev => {
      const decs = [...(prev.decisions || [])];
      decs[index] = { ...decs[index], [key]: val };
      return { ...prev, decisions: decs };
    });
  };

  const handleAddDecision = () => {
    setEditDraft(prev => ({
      ...prev,
      decisions: [
        ...(prev.decisions || []),
        { decision: '', rationale: 'Agreed upon during discussion' },
      ],
    }));
  };

  const handleRemoveDecision = (index) => {
    setEditDraft(prev => {
      const decs = [...(prev.decisions || [])];
      decs.splice(index, 1);
      return { ...prev, decisions: decs };
    });
  };

  // Helper for Action Items editing
  const handleActionItemChange = (index, key, val) => {
    setEditDraft(prev => {
      const items = [...(prev.actionItems || [])];
      items[index] = { ...items[index], [key]: val };
      return { ...prev, actionItems: items };
    });
  };

  const handleAddActionItem = () => {
    setEditDraft(prev => ({
      ...prev,
      actionItems: [
        ...(prev.actionItems || []),
        { task: '', owner: 'Unassigned', deadline: 'Not specified', priority: 'Medium', status: 'Pending' },
      ],
    }));
  };

  const handleRemoveActionItem = (index) => {
    setEditDraft(prev => {
      const items = [...(prev.actionItems || [])];
      items.splice(index, 1);
      return { ...prev, actionItems: items };
    });
  };

  // If no MoM exists and not generating, show inviting action banner
  if (!mom && !isGenerating) {
    return (
      <div className="ghost-panel p-6 bg-[#FFFFFF] border border-[#DCE2EB] text-center space-y-4">
        <div className="w-12 h-12 rounded-full bg-[#EEF2FF] text-[#5145CD] flex items-center justify-center mx-auto border border-[#C7D2FE]">
          <FileText className="w-6 h-6" />
        </div>
        <div className="max-w-lg mx-auto space-y-1">
          <h3 className="text-base font-semibold text-[#172033] tracking-tight">
            AI Minutes of Meeting (MoM)
          </h3>
          <p className="text-xs text-[#526078] leading-relaxed">
            Generate formal, executive-ready Minutes of Meeting including participants, agenda, discussion points, Q&A, confirmed decisions, and deliverables from this meeting.
          </p>
        </div>
        <button
          onClick={handleRegenerate}
          className="btn-primary text-xs py-2 px-4 inline-flex items-center gap-2 shadow-xs"
        >
          <Sparkles className="w-4 h-4 text-[#C7D2FE]" />
          <span>Generate Minutes of Meeting (MoM)</span>
        </button>
      </div>
    );
  }

  // Loading state during generation
  if (isGenerating) {
    return (
      <div className="ghost-panel p-8 bg-[#FFFFFF] border border-[#DCE2EB] text-center space-y-3">
        <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-[#EEF2FF] text-[#5145CD] animate-spin mb-1">
          <RefreshCw className="w-5 h-5" />
        </div>
        <h4 className="text-sm font-semibold text-[#172033]">
          Generating AI Minutes of Meeting...
        </h4>
        <p className="text-xs text-[#526078] max-w-md mx-auto">
          Extracting participants, agenda progression, key discussion points, Q&A, decisions, and deliverables using Gemini intelligence.
        </p>
      </div>
    );
  }

  const currentData = isEditing ? editDraft : mom;

  return (
    <div className="ghost-panel overflow-hidden bg-[#FFFFFF] border border-[#DCE2EB] shadow-xs">
      {/* Top Document Action Bar */}
      <div className="p-4 border-b border-[#DCE2EB] bg-[#F8FAFC] flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-sm bg-[#5145CD] text-white">
            <FileText className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-[#172033] tracking-wider uppercase">
                Minutes of Meeting (MoM)
              </span>
              {mom.isEdited && (
                <span className="px-1.5 py-0.2 rounded-xs bg-[#FEF3C7] text-[#92400E] border border-[#FDE68A] text-[9px] font-bold uppercase">
                  Edited
                </span>
              )}
              {saveSuccess && (
                <span className="inline-flex items-center gap-1 text-[10px] text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded-xs border border-emerald-200">
                  <Check className="w-3 h-3 text-emerald-600" />
                  <span>Saved to Database</span>
                </span>
              )}
            </div>
            <p className="text-[11px] text-[#526078]">
              Official structured proceedings and record of decisions
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center flex-wrap gap-2">
          {isEditing ? (
            <>
              <button
                onClick={handleSaveEdit}
                disabled={saving}
                className="btn-primary text-xs py-1.5 px-3 flex items-center gap-1.5"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{saving ? 'Saving...' : 'Save MoM'}</span>
              </button>
              <button
                onClick={handleCancelEdit}
                disabled={saving}
                className="btn-secondary text-xs py-1.5 px-3 flex items-center gap-1.5"
              >
                <X className="w-3.5 h-3.5" />
                <span>Cancel</span>
              </button>
            </>
          ) : (
            <>
              <button
                onClick={handleStartEdit}
                className="btn-secondary text-xs py-1.5 px-2.5 flex items-center gap-1.5"
                title="Edit MoM details"
              >
                <Pencil className="w-3.5 h-3.5 text-[#5145CD]" />
                <span>Edit MoM</span>
              </button>

              <button
                onClick={handleDownloadPdf}
                className="btn-secondary text-xs py-1.5 px-2.5 flex items-center gap-1.5"
                title="Download formatted PDF"
              >
                <Download className="w-3.5 h-3.5 text-[#526078]" />
                <span>Download PDF</span>
              </button>

              <button
                onClick={handlePrint}
                className="btn-secondary text-xs py-1.5 px-2.5 flex items-center gap-1.5"
                title="Print document"
              >
                <Printer className="w-3.5 h-3.5 text-[#526078]" />
                <span>Print</span>
              </button>

              <button
                onClick={() => setShowRegenerateConfirm(true)}
                className="btn-secondary text-xs py-1.5 px-2.5 flex items-center gap-1.5 text-slate-700 hover:text-[#5145CD]"
                title="Regenerate from transcript"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Regenerate</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Regenerate Confirmation Dialog */}
      {showRegenerateConfirm && (
        <div className="p-3.5 bg-amber-50 border-b border-amber-200 text-xs text-amber-900 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
            <span>
              Regenerating will re-analyze the transcript with Gemini and replace the current MoM. Do you want to continue?
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleRegenerate}
              className="px-2.5 py-1 bg-amber-700 hover:bg-amber-800 text-white rounded text-xs font-medium"
            >
              Confirm Regenerate
            </button>
            <button
              onClick={() => setShowRegenerateConfirm(false)}
              className="px-2.5 py-1 bg-white border border-amber-300 text-amber-900 rounded text-xs font-medium"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Document Content View / Editor */}
      <div className="p-6 space-y-6 bg-[#FFFFFF]">
        {/* Document Header & Metadata Grid */}
        <div className="border border-[#DCE2EB] rounded-sm p-4 bg-[#F8FAFC] space-y-3">
          {isEditing ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-bold text-[#526078] uppercase tracking-wider block mb-1">
                  Meeting Title
                </label>
                <input
                  type="text"
                  value={editDraft.title || ''}
                  onChange={(e) => setEditDraft({ ...editDraft, title: e.target.value })}
                  className="input-base text-xs py-1 px-2.5 w-full"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-[#526078] uppercase tracking-wider block mb-1">
                  Department / Scope
                </label>
                <input
                  type="text"
                  value={editDraft.department || ''}
                  onChange={(e) => setEditDraft({ ...editDraft, department: e.target.value })}
                  className="input-base text-xs py-1 px-2.5 w-full"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-[#526078] uppercase tracking-wider block mb-1">
                  Meeting Date
                </label>
                <input
                  type="text"
                  value={editDraft.meetingDate || ''}
                  onChange={(e) => setEditDraft({ ...editDraft, meetingDate: e.target.value })}
                  className="input-base text-xs py-1 px-2.5 w-full"
                  placeholder="YYYY-MM-DD"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-[#526078] uppercase tracking-wider block mb-1">
                  Meeting Time
                </label>
                <input
                  type="text"
                  value={editDraft.meetingTime || ''}
                  onChange={(e) => setEditDraft({ ...editDraft, meetingTime: e.target.value })}
                  className="input-base text-xs py-1 px-2.5 w-full"
                  placeholder="e.g. 10:00 AM or Not specified"
                />
              </div>
            </div>
          ) : (
            <div>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#DCE2EB] pb-3 mb-3">
                <h2 className="text-lg font-bold text-[#172033] tracking-tight">
                  {currentData.title || meetingTitle}
                </h2>
                <span className="text-[11px] font-mono text-[#526078]">
                  Generated: {currentData.generatedAt ? new Date(currentData.generatedAt).toLocaleString() : 'Recent'}
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div className="space-y-0.5">
                  <span className="text-[10px] font-semibold text-[#526078] uppercase tracking-wider block">Date</span>
                  <span className="font-semibold text-[#172033] block">{currentData.meetingDate || 'Not specified'}</span>
                </div>
                <div className="space-y-0.5">
                  <span className="text-[10px] font-semibold text-[#526078] uppercase tracking-wider block">Time</span>
                  <span className="font-semibold text-[#172033] block">{currentData.meetingTime || 'Not specified'}</span>
                </div>
                <div className="space-y-0.5">
                  <span className="text-[10px] font-semibold text-[#526078] uppercase tracking-wider block">Department</span>
                  <span className="font-semibold text-[#172033] block">{currentData.department || 'General'}</span>
                </div>
                <div className="space-y-0.5">
                  <span className="text-[10px] font-semibold text-[#526078] uppercase tracking-wider block">Scope</span>
                  <span className="font-semibold text-[#172033] block">
                    {(currentData.actionItems || []).length} Tasks | {(currentData.decisions || []).length} Decisions
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 1. Participants */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-[#172033] uppercase tracking-wider flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-[#5145CD]" />
              1. Participants
            </span>
            {isEditing && (
              <button
                onClick={() => handleAddArrayItem('participants', '')}
                className="text-[11px] text-[#5145CD] hover:underline flex items-center gap-0.5 font-medium"
              >
                <Plus className="w-3 h-3" />
                <span>Add Participant</span>
              </button>
            )}
          </div>
          {isEditing ? (
            <div className="space-y-1.5">
              {(editDraft.participants || []).map((p, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={p}
                    onChange={(e) => handleArrayChange('participants', idx, e.target.value)}
                    className="input-base text-xs py-1 px-2.5 flex-1"
                    placeholder="Participant Name"
                  />
                  <button
                    onClick={() => handleRemoveArrayItem('participants', idx)}
                    className="p-1 text-red-600 hover:text-red-800"
                    title="Remove participant"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
              {(editDraft.participants || []).length === 0 && (
                <p className="text-xs text-slate-400 italic">No participants listed.</p>
              )}
            </div>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {(currentData.participants || []).map((p, idx) => (
                <span
                  key={idx}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-sm bg-[#F4F6FA] text-[#172033] border border-[#DCE2EB] text-xs font-medium"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-[#5145CD]" />
                  <span>{p}</span>
                </span>
              ))}
              {(currentData.participants || []).length === 0 && (
                <span className="text-xs text-slate-500 italic">Not specified</span>
              )}
            </div>
          )}
        </div>

        {/* 2. Meeting Objective / Purpose */}
        <div className="space-y-2">
          <span className="text-xs font-bold text-[#172033] uppercase tracking-wider flex items-center gap-1.5">
            <Target className="w-3.5 h-3.5 text-[#5145CD]" />
            2. Meeting Objective / Purpose
          </span>
          {isEditing ? (
            <textarea
              rows={2}
              value={editDraft.objective || ''}
              onChange={(e) => setEditDraft({ ...editDraft, objective: e.target.value })}
              className="input-base text-xs py-1.5 px-2.5 w-full leading-relaxed"
              placeholder="State the objective of the meeting..."
            />
          ) : (
            <p className="text-xs sm:text-sm text-[#172033] leading-relaxed p-3 rounded-sm bg-[#F8FAFC] border border-[#E2E8F0]">
              {currentData.objective || 'Not specified'}
            </p>
          )}
        </div>

        {/* 3. Agenda Items */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-[#172033] uppercase tracking-wider flex items-center gap-1.5">
              <ListChecks className="w-3.5 h-3.5 text-[#5145CD]" />
              3. Agenda Items
            </span>
            {isEditing && (
              <button
                onClick={() => handleAddArrayItem('agenda', '')}
                className="text-[11px] text-[#5145CD] hover:underline flex items-center gap-0.5 font-medium"
              >
                <Plus className="w-3 h-3" />
                <span>Add Agenda Item</span>
              </button>
            )}
          </div>
          {isEditing ? (
            <div className="space-y-1.5">
              {(editDraft.agenda || []).map((item, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-slate-400 w-4 text-right">{idx + 1}.</span>
                  <input
                    type="text"
                    value={item}
                    onChange={(e) => handleArrayChange('agenda', idx, e.target.value)}
                    className="input-base text-xs py-1 px-2.5 flex-1"
                    placeholder="Agenda Item Topic"
                  />
                  <button
                    onClick={() => handleRemoveArrayItem('agenda', idx)}
                    className="p-1 text-red-600 hover:text-red-800"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <ul className="space-y-1.5 pl-2">
              {(currentData.agenda || []).map((item, idx) => (
                <li key={idx} className="text-xs text-[#172033] flex items-start gap-2 leading-relaxed">
                  <span className="font-semibold text-[#5145CD]">{idx + 1}.</span>
                  <span>{item}</span>
                </li>
              ))}
              {(currentData.agenda || []).length === 0 && (
                <li className="text-xs text-slate-400 italic">Not specified</li>
              )}
            </ul>
          )}
        </div>

        {/* 4. Key Discussion Points */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-[#172033] uppercase tracking-wider flex items-center gap-1.5">
              <MessageSquare className="w-3.5 h-3.5 text-[#5145CD]" />
              4. Key Discussion Points
            </span>
            {isEditing && (
              <button
                onClick={() => handleAddArrayItem('keyDiscussionPoints', '')}
                className="text-[11px] text-[#5145CD] hover:underline flex items-center gap-0.5 font-medium"
              >
                <Plus className="w-3 h-3" />
                <span>Add Discussion Point</span>
              </button>
            )}
          </div>
          {isEditing ? (
            <div className="space-y-1.5">
              {(editDraft.keyDiscussionPoints || []).map((item, idx) => (
                <div key={idx} className="flex items-start gap-2">
                  <textarea
                    rows={2}
                    value={item}
                    onChange={(e) => handleArrayChange('keyDiscussionPoints', idx, e.target.value)}
                    className="input-base text-xs py-1 px-2.5 flex-1 leading-relaxed"
                    placeholder="Discussion takeaway..."
                  />
                  <button
                    onClick={() => handleRemoveArrayItem('keyDiscussionPoints', idx)}
                    className="p-1 text-red-600 hover:text-red-800 mt-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <ul className="space-y-2">
              {(currentData.keyDiscussionPoints || []).map((point, idx) => (
                <li key={idx} className="text-xs text-[#172033] flex items-start gap-2 leading-relaxed">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#5145CD] mt-1.5 shrink-0" />
                  <span>{point}</span>
                </li>
              ))}
              {(currentData.keyDiscussionPoints || []).length === 0 && (
                <li className="text-xs text-slate-400 italic">Not specified</li>
              )}
            </ul>
          )}
        </div>

        {/* 5. Important Questions and Responses */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-[#172033] uppercase tracking-wider flex items-center gap-1.5">
              <HelpCircle className="w-3.5 h-3.5 text-[#5145CD]" />
              5. Important Questions and Responses
            </span>
            {isEditing && (
              <button
                onClick={handleAddQA}
                className="text-[11px] text-[#5145CD] hover:underline flex items-center gap-0.5 font-medium"
              >
                <Plus className="w-3 h-3" />
                <span>Add Question & Response</span>
              </button>
            )}
          </div>
          {isEditing ? (
            <div className="space-y-3">
              {(editDraft.questionsAndResponses || []).map((qr, idx) => (
                <div key={idx} className="p-3 rounded-sm bg-[#F8FAFC] border border-[#CBD5E1] space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-bold text-[#5145CD] uppercase">Question #{idx + 1}</span>
                    <button
                      onClick={() => handleRemoveQA(idx)}
                      className="p-1 text-red-600 hover:text-red-800"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <div className="sm:col-span-2">
                      <input
                        type="text"
                        value={qr.question || ''}
                        onChange={(e) => handleQAChange(idx, 'question', e.target.value)}
                        className="input-base text-xs py-1 px-2 w-full"
                        placeholder="Question text"
                      />
                    </div>
                    <div>
                      <input
                        type="text"
                        value={qr.askedBy || ''}
                        onChange={(e) => handleQAChange(idx, 'askedBy', e.target.value)}
                        className="input-base text-xs py-1 px-2 w-full"
                        placeholder="Asked by"
                      />
                    </div>
                  </div>
                  <textarea
                    rows={2}
                    value={qr.response || ''}
                    onChange={(e) => handleQAChange(idx, 'response', e.target.value)}
                    className="input-base text-xs py-1 px-2 w-full"
                    placeholder="Response or answer given"
                  />
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {(currentData.questionsAndResponses || []).map((qr, idx) => (
                <div key={idx} className="p-3 rounded-sm bg-[#F8FAFC] border border-[#E2E8F0] space-y-1 text-xs">
                  <div className="flex items-baseline gap-1.5 font-semibold text-[#172033]">
                    <span className="text-[#5145CD]">Q:</span>
                    <span>{qr.question}</span>
                    {qr.askedBy && qr.askedBy !== 'Not specified' && (
                      <span className="text-[10px] text-[#526078] font-normal">({qr.askedBy})</span>
                    )}
                  </div>
                  <div className="flex items-baseline gap-1.5 text-[#526078] pl-3 border-l-2 border-[#5145CD]/40">
                    <strong className="text-[#172033]">A:</strong>
                    <span>{qr.response || 'Not specified'}</span>
                  </div>
                </div>
              ))}
              {(currentData.questionsAndResponses || []).length === 0 && (
                <p className="text-xs text-slate-400 italic">No specific questions recorded.</p>
              )}
            </div>
          )}
        </div>

        {/* 6. Decisions Made */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-[#172033] uppercase tracking-wider flex items-center gap-1.5">
              <Scale className="w-3.5 h-3.5 text-[#5145CD]" />
              6. Decisions Made
            </span>
            {isEditing && (
              <button
                onClick={handleAddDecision}
                className="text-[11px] text-[#5145CD] hover:underline flex items-center gap-0.5 font-medium"
              >
                <Plus className="w-3 h-3" />
                <span>Add Decision</span>
              </button>
            )}
          </div>
          {isEditing ? (
            <div className="space-y-2">
              {(editDraft.decisions || []).map((d, idx) => (
                <div key={idx} className="p-2.5 rounded-sm bg-[#F8FAFC] border border-[#CBD5E1] space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <input
                      type="text"
                      value={d.decision || ''}
                      onChange={(e) => handleDecisionChange(idx, 'decision', e.target.value)}
                      className="input-base text-xs py-1 px-2 flex-1 font-semibold"
                      placeholder="Confirmed decision"
                    />
                    <button
                      onClick={() => handleRemoveDecision(idx)}
                      className="p-1 text-red-600 hover:text-red-800"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <input
                    type="text"
                    value={d.rationale || ''}
                    onChange={(e) => handleDecisionChange(idx, 'rationale', e.target.value)}
                    className="input-base text-xs py-1 px-2 w-full text-slate-600"
                    placeholder="Rationale / Context"
                  />
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {(currentData.decisions || []).map((d, idx) => (
                <div key={idx} className="p-3 rounded-sm bg-[#F4F6FA] border border-[#DCE2EB] space-y-1 text-xs">
                  <div className="font-semibold text-[#172033]">
                    {d.decision}
                  </div>
                  <div className="text-[11px] text-[#526078]">
                    <strong className="text-[#172033]">Rationale: </strong>
                    {d.rationale || 'Agreed upon during discussion'}
                  </div>
                </div>
              ))}
              {(currentData.decisions || []).length === 0 && (
                <p className="text-xs text-slate-400 italic">No decisions recorded.</p>
              )}
            </div>
          )}
        </div>

        {/* 7. Action Items & Deliverables */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-[#172033] uppercase tracking-wider flex items-center gap-1.5">
              <CheckSquare className="w-3.5 h-3.5 text-[#5145CD]" />
              7. Action Items & Deliverables
            </span>
            {isEditing && (
              <button
                onClick={handleAddActionItem}
                className="text-[11px] text-[#5145CD] hover:underline flex items-center gap-0.5 font-medium"
              >
                <Plus className="w-3 h-3" />
                <span>Add Deliverable</span>
              </button>
            )}
          </div>
          {isEditing ? (
            <div className="space-y-2">
              {(editDraft.actionItems || []).map((item, idx) => (
                <div key={idx} className="p-3 rounded-sm bg-[#F8FAFC] border border-[#CBD5E1] space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <input
                      type="text"
                      value={item.task || ''}
                      onChange={(e) => handleActionItemChange(idx, 'task', e.target.value)}
                      className="input-base text-xs py-1 px-2 flex-1 font-semibold"
                      placeholder="Task deliverable description"
                    />
                    <button
                      onClick={() => handleRemoveActionItem(idx)}
                      className="p-1 text-red-600 hover:text-red-800"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 text-xs">
                    <div>
                      <label className="text-[10px] font-bold text-[#526078] block">Owner</label>
                      <input
                        type="text"
                        value={item.owner || ''}
                        onChange={(e) => handleActionItemChange(idx, 'owner', e.target.value)}
                        className="input-base text-xs py-1 px-2 w-full"
                        placeholder="Owner name"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-[#526078] block">Deadline</label>
                      <input
                        type="text"
                        value={item.deadline || ''}
                        onChange={(e) => handleActionItemChange(idx, 'deadline', e.target.value)}
                        className="input-base text-xs py-1 px-2 w-full"
                        placeholder="Deadline or date"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-[#526078] block">Priority</label>
                      <select
                        value={item.priority || 'Medium'}
                        onChange={(e) => handleActionItemChange(idx, 'priority', e.target.value)}
                        className="input-base text-xs py-1 px-2 w-full"
                      >
                        <option value="High">High</option>
                        <option value="Medium">Medium</option>
                        <option value="Low">Low</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-[#526078] block">Status</label>
                      <select
                        value={item.status || 'Pending'}
                        onChange={(e) => handleActionItemChange(idx, 'status', e.target.value)}
                        className="input-base text-xs py-1 px-2 w-full"
                      >
                        <option value="Pending">Pending</option>
                        <option value="In Progress">In Progress</option>
                        <option value="Completed">Completed</option>
                      </select>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-[#DCE2EB] text-[#526078] uppercase text-[10px] tracking-wider bg-[#F4F6FA]">
                    <th className="py-2.5 px-3">Task Deliverable</th>
                    <th className="py-2.5 px-3">Responsible Person</th>
                    <th className="py-2.5 px-3">Deadline</th>
                    <th className="py-2.5 px-3">Priority</th>
                    <th className="py-2.5 px-3 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#DCE2EB]">
                  {(currentData.actionItems || []).map((item, idx) => (
                    <tr key={idx} className="hover:bg-[#F4F6FA]">
                      <td className="py-2.5 px-3 font-medium text-[#172033]">
                        {item.task}
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="px-2 py-0.5 rounded-sm bg-[#F4F6FA] text-ghost-text border border-[#DCE2EB] font-medium text-[11px]">
                          {item.owner || 'Unassigned'}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-mono text-[11px] text-[#526078]">
                        {item.deadline || 'Not specified'}
                      </td>
                      <td className="py-2.5 px-3">
                        <PriorityBadge priority={item.priority} />
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <span className="px-1.5 py-0.5 rounded-xs bg-[#F4F6FA] border border-[#CBD5E1] text-[10px] font-semibold text-[#172033]">
                          {item.status || 'Pending'}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {(currentData.actionItems || []).length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-4 text-center text-slate-400 italic">
                        No action items recorded.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* 8. Pending Issues / Unresolved Questions */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-[#172033] uppercase tracking-wider flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
              8. Pending Issues / Unresolved Questions
            </span>
            {isEditing && (
              <button
                onClick={() => handleAddArrayItem('pendingIssues', '')}
                className="text-[11px] text-[#5145CD] hover:underline flex items-center gap-0.5 font-medium"
              >
                <Plus className="w-3 h-3" />
                <span>Add Issue</span>
              </button>
            )}
          </div>
          {isEditing ? (
            <div className="space-y-1.5">
              {(editDraft.pendingIssues || []).map((issue, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={issue}
                    onChange={(e) => handleArrayChange('pendingIssues', idx, e.target.value)}
                    className="input-base text-xs py-1 px-2.5 flex-1"
                    placeholder="Pending issue or unresolved topic"
                  />
                  <button
                    onClick={() => handleRemoveArrayItem('pendingIssues', idx)}
                    className="p-1 text-red-600 hover:text-red-800"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <ul className="space-y-1.5">
              {(currentData.pendingIssues || []).map((issue, idx) => (
                <li key={idx} className="text-xs text-[#172033] flex items-start gap-2 leading-relaxed">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 mt-1.5 shrink-0" />
                  <span>{issue}</span>
                </li>
              ))}
              {(currentData.pendingIssues || []).length === 0 && (
                <li className="text-xs text-slate-400 italic">No pending issues identified</li>
              )}
            </ul>
          )}
        </div>

        {/* 9. Follow-up Meeting Details */}
        <div className="space-y-2">
          <span className="text-xs font-bold text-[#172033] uppercase tracking-wider flex items-center gap-1.5">
            <CalendarDays className="w-3.5 h-3.5 text-[#5145CD]" />
            9. Follow-up Meeting Details
          </span>
          {isEditing ? (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div>
                <label className="text-[10px] font-bold text-[#526078] block mb-0.5">Date</label>
                <input
                  type="text"
                  value={editDraft.followUpMeeting?.date || ''}
                  onChange={(e) => setEditDraft({
                    ...editDraft,
                    followUpMeeting: { ...editDraft.followUpMeeting, date: e.target.value }
                  })}
                  className="input-base text-xs py-1 px-2 w-full"
                  placeholder="Date or Not specified"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-[#526078] block mb-0.5">Time</label>
                <input
                  type="text"
                  value={editDraft.followUpMeeting?.time || ''}
                  onChange={(e) => setEditDraft({
                    ...editDraft,
                    followUpMeeting: { ...editDraft.followUpMeeting, time: e.target.value }
                  })}
                  className="input-base text-xs py-1 px-2 w-full"
                  placeholder="Time or Not specified"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-[#526078] block mb-0.5">Agenda / Notes</label>
                <input
                  type="text"
                  value={editDraft.followUpMeeting?.agenda || editDraft.followUpMeeting?.details || ''}
                  onChange={(e) => setEditDraft({
                    ...editDraft,
                    followUpMeeting: { ...editDraft.followUpMeeting, agenda: e.target.value, details: e.target.value }
                  })}
                  className="input-base text-xs py-1 px-2 w-full"
                  placeholder="Follow-up agenda or Not specified"
                />
              </div>
            </div>
          ) : (
            <div className="p-3 rounded-sm bg-[#F8FAFC] border border-[#E2E8F0] text-xs text-[#172033]">
              {(() => {
                const fu = currentData.followUpMeeting || {};
                const parts = [
                  fu.details && fu.details !== 'Not specified' ? fu.details : (fu.agenda && fu.agenda !== 'Not specified' ? fu.agenda : null),
                  fu.date && fu.date !== 'Not specified' ? `Date: ${fu.date}` : null,
                  fu.time && fu.time !== 'Not specified' ? `Time: ${fu.time}` : null,
                ].filter(Boolean);

                return parts.length > 0 ? parts.join(' | ') : 'Not specified';
              })()}
            </div>
          )}
        </div>

        {/* 10. Conclusion / Summary */}
        <div className="space-y-2">
          <span className="text-xs font-bold text-[#172033] uppercase tracking-wider flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            10. Conclusion / Summary
          </span>
          {isEditing ? (
            <textarea
              rows={3}
              value={editDraft.conclusion || ''}
              onChange={(e) => setEditDraft({ ...editDraft, conclusion: e.target.value })}
              className="input-base text-xs py-1.5 px-2.5 w-full leading-relaxed"
              placeholder="Final meeting wrap-up and conclusions..."
            />
          ) : (
            <p className="text-xs sm:text-sm text-[#172033] leading-relaxed p-3.5 rounded-sm bg-[#F8FAFC] border border-[#E2E8F0]">
              {currentData.conclusion || 'Not specified'}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export default MinutesOfMeetingView;

