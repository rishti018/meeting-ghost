import React from 'react';
import { Ghost } from 'lucide-react';
import { Link } from 'react-router-dom';

export function EmptyState({
  title = 'No records found',
  description = 'Get started by ingesting a meeting transcript or loading the sample dataset.',
  actionText = 'Ingest Meeting',
  actionLink = '/new',
  onAction,
  icon: Icon = Ghost,
}) {
  return (
    <div className="ghost-panel p-10 text-center flex flex-col items-center justify-center max-w-md mx-auto my-6 border-dashed">
      <div className="w-10 h-10 rounded-sm bg-ghost-muted border border-ghost-border flex items-center justify-center text-ghost-secondary mb-3">
        <Icon className="w-4 h-4" />
      </div>
      <h3 className="text-sm font-semibold text-ghost-text mb-1">{title}</h3>
      <p className="text-xs text-ghost-secondary max-w-sm mb-5 leading-relaxed">{description}</p>

      {actionLink ? (
        <Link to={actionLink} className="btn-primary">
          {actionText}
        </Link>
      ) : onAction ? (
        <button onClick={onAction} className="btn-primary">
          {actionText}
        </button>
      ) : null}
    </div>
  );
}
