import React, { useState, useEffect } from "react";

interface Repo {
  id: number;
  full_name: string;
  description: string | null;
  html_url: string;
  private: boolean;
  updated_at: string;
  language: string | null;
}

interface RepoSelectorProps {
  listRepos: (page?: number) => Promise<Repo[]>;
  onSelect: (repo: Repo) => void;
  selectedRepo: string | null;
}

export function RepoSelector({
  listRepos,
  onSelect,
  selectedRepo,
}: RepoSelectorProps) {
  const [repos, setRepos] = useState<Repo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    listRepos(1)
      .then((data) => {
        setRepos(data);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, [listRepos]);

  if (loading) {
    return <div className="empty-state-small">Loading repos...</div>;
  }

  if (error) {
    return <div className="empty-state-small">Error: {error}</div>;
  }

  return (
    <div className="repo-selector">
      <div className="section-label">Select Repository</div>
      <div className="repo-list">
        {repos.map((repo) => (
          <button
            key={repo.id}
            type="button"
            className={`repo-item ${selectedRepo === repo.full_name ? "selected" : ""}`}
            onClick={() => onSelect(repo)}
          >
            <div className="repo-name">
              {repo.private && <span className="repo-private-badge">Private</span>}
              {repo.full_name}
            </div>
            {repo.description && (
              <div className="repo-description">{repo.description}</div>
            )}
            <div className="repo-meta">
              {repo.language && <span>{repo.language}</span>}
              <span>{new Date(repo.updated_at).toLocaleDateString()}</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
