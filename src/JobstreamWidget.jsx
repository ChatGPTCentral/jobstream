import React, { useState, useEffect } from 'react';

function loadFromStorage(key, defaultValue) {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? defaultValue : JSON.parse(raw);
  } catch {
    return defaultValue;
  }
}

function saveToStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

function sanitizeHTML(html) {
  if (!html) return '';
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('script, iframe, object, embed').forEach(el => el.remove());
  doc.querySelectorAll('*').forEach(el => {
    Array.from(el.attributes).forEach(attr => {
      if (attr.name.startsWith('on')) el.removeAttribute(attr.name);
    });
  });
  return doc.body.innerHTML;
}

export default function JobstreamWidget() {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [locationFilter, setLocationFilter] = useState(() => loadFromStorage('jobstream_locationFilter', 'all'));
  const [typeFilter, setTypeFilter] = useState(() => loadFromStorage('jobstream_typeFilter', 'all'));
  const [activeTab, setActiveTab] = useState('all');
  const [expandedId, setExpandedId] = useState(null);
  const [savedJobs, setSavedJobs] = useState(() => loadFromStorage('jobstream_saved', []));
  const [appliedJobs, setAppliedJobs] = useState(() => loadFromStorage('jobstream_applied', []));
  const [feedDate, setFeedDate] = useState('');

  const API_URL = '/api/jobs';

  useEffect(() => { saveToStorage('jobstream_locationFilter', locationFilter); }, [locationFilter]);
  useEffect(() => { saveToStorage('jobstream_typeFilter', typeFilter); }, [typeFilter]);

  useEffect(() => {
    fetchJobs();
  }, []);

  const fetchJobs = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(API_URL);
      if (!response.ok) throw new Error('Failed to fetch jobs');

      const xmlText = await response.text();
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(xmlText, 'text/xml');

      const lastBuildDate = xmlDoc.getElementsByTagName('lastBuildDate')[0]?.textContent || '';
      setFeedDate(lastBuildDate);

      const jobNodes = xmlDoc.getElementsByTagName('job');
      const parsedJobs = Array.from(jobNodes).map(job => ({
        referencenumber: job.getElementsByTagName('referencenumber')[0]?.textContent || '',
        title: job.getElementsByTagName('title')[0]?.textContent || '',
        company: job.getElementsByTagName('company')[0]?.textContent || '',
        city: job.getElementsByTagName('city')[0]?.textContent || '',
        state: job.getElementsByTagName('state')[0]?.textContent || '',
        type: job.getElementsByTagName('type')[0]?.textContent || '',
        summary: job.getElementsByTagName('summary')[0]?.textContent || '',
        description: job.getElementsByTagName('description')[0]?.textContent || '',
        url: job.getElementsByTagName('url')[0]?.textContent || '',
        date: job.getElementsByTagName('date')[0]?.textContent || '',
        workLocationType: job.getElementsByTagName('work_location_type')[0]?.textContent || '',
        seniority: job.getElementsByTagName('job_seniority')[0]?.textContent || '',
        salaryMin: job.getElementsByTagName('estimated_salary_min')[0]?.textContent || '',
        salaryMax: job.getElementsByTagName('estimated_salary_max')[0]?.textContent || '',
      }));

      setJobs(parsedJobs);
      setLoading(false);
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  const toggleSaved = (refNum, e) => {
    e.preventDefault();
    e.stopPropagation();
    const next = savedJobs.includes(refNum)
      ? savedJobs.filter(id => id !== refNum)
      : [...savedJobs, refNum];
    setSavedJobs(next);
    saveToStorage('jobstream_saved', next);
  };

  const toggleApplied = (refNum, e) => {
    e.preventDefault();
    e.stopPropagation();
    const next = appliedJobs.includes(refNum)
      ? appliedJobs.filter(id => id !== refNum)
      : [...appliedJobs, refNum];
    setAppliedJobs(next);
    saveToStorage('jobstream_applied', next);
  };

  const filteredJobs = jobs.filter(job => {
    if (activeTab === 'saved' && !savedJobs.includes(job.referencenumber)) return false;
    if (activeTab === 'applied' && !appliedJobs.includes(job.referencenumber)) return false;

    const matchesSearch =
      job.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      job.company.toLowerCase().includes(searchTerm.toLowerCase()) ||
      job.summary.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesLocation = locationFilter === 'all' || job.workLocationType === locationFilter;
    const matchesType = typeFilter === 'all' || job.type === typeFilter;

    return matchesSearch && matchesLocation && matchesType;
  });

  const uniqueLocations = ['all', ...new Set(jobs.map(j => j.workLocationType).filter(v => v && v.toLowerCase() !== 'not specified'))];
  const uniqueTypes = ['all', ...new Set(jobs.map(j => j.type).filter(Boolean))];

  const formatSalary = (min, max) => {
    if (!min && !max) return null;
    const formatter = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    });
    if (min && max) return `${formatter.format(min)} - ${formatter.format(max)}`;
    if (min) return `From ${formatter.format(min)}`;
    if (max) return `Up to ${formatter.format(max)}`;
  };

  const formatDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    const now = new Date();
    const diffDays = Math.ceil(Math.abs(now - date) / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const formatFeedAge = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    if (isNaN(date)) return '';
    const diffMs = Date.now() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 2) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${Math.floor(diffHours / 24)}d ago`;
  };

  // Only show location type tag if it's a meaningful value
  const isValidLocationType = (val) =>
    val && val.toLowerCase() !== 'not specified' && val.trim() !== '';

  // Auto-generate quick-filter chips from feed data
  const quickFilters = React.useMemo(() => {
    if (!jobs.length) return [];

    const STOP_WORDS = new Set([
      'a','an','the','and','or','of','to','in','for','with','at','by','from',
      'on','as','is','are','be','was','were','will','have','has','had',
      'not','but','so','if','it','its','this','that','we','you','they',
      'our','your','their','i','my','me','us','ii','iii','iv',
    ]);

    // Frequency count of meaningful title words
    const freq = {};
    jobs.forEach(job => {
      job.title.toLowerCase()
        .replace(/[^a-z\s]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length > 2 && !STOP_WORDS.has(w))
        .forEach(w => { freq[w] = (freq[w] || 0) + 1; });
    });

    const topKeywords = Object.entries(freq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([word]) => ({
        label: word.charAt(0).toUpperCase() + word.slice(1),
        kind: 'keyword',
        value: word,
      }));

    // Location chips (Remote / Hybrid first)
    const locationOrder = ['remote', 'hybrid', 'on-site', 'onsite', 'in-office'];
    const locationChips = uniqueLocations
      .filter(v => v !== 'all')
      .sort((a, b) => {
        const ai = locationOrder.indexOf(a.toLowerCase());
        const bi = locationOrder.indexOf(b.toLowerCase());
        return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
      })
      .map(v => ({ label: v, kind: 'location', value: v }));

    // Job type chips
    const typeChips = uniqueTypes
      .filter(v => v !== 'all')
      .map(v => ({ label: v, kind: 'type', value: v }));

    return [...locationChips, ...typeChips, ...topKeywords];
  }, [jobs, uniqueLocations, uniqueTypes]);

  const isChipActive = (chip) => {
    if (chip.kind === 'location') return locationFilter === chip.value;
    if (chip.kind === 'type') return typeFilter === chip.value;
    return searchTerm.toLowerCase() === chip.value.toLowerCase();
  };

  const handleChipClick = (chip) => {
    if (chip.kind === 'location') {
      setLocationFilter(isChipActive(chip) ? 'all' : chip.value);
    } else if (chip.kind === 'type') {
      setTypeFilter(isChipActive(chip) ? 'all' : chip.value);
    } else {
      setSearchTerm(isChipActive(chip) ? '' : chip.label);
    }
  };

  if (loading) {
    return (
      <div style={styles.container}>
        <div style={styles.loadingContainer}>
          <div style={styles.loadingBar}></div>
          <p style={styles.loadingText}>Loading opportunities</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={styles.container}>
        <div style={styles.errorContainer}>
          <div style={styles.errorIcon}>⚠</div>
          <h3 style={styles.errorTitle}>Unable to load jobs</h3>
          <p style={styles.errorText}>{error}</p>
          <button onClick={fetchJobs} style={styles.retryButton}>Try again</button>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <div style={styles.headerLine}></div>
        <h1 style={styles.title}>Job Opportunities</h1>
        <p style={styles.brandSubtitle}>Powered by Jobstream™</p>
        <p style={styles.subtitle}>
          {filteredJobs.length} of {jobs.length} positions
          {feedDate && (
            <span style={styles.feedAge}>· Updated {formatFeedAge(feedDate)}</span>
          )}
        </p>
      </header>

      <div style={styles.tabBar}>
        {['all', 'saved', 'applied'].map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{ ...styles.tabButton, ...(activeTab === tab ? styles.tabButtonActive : {}) }}
          >
            {tab === 'all' && 'All Jobs'}
            {tab === 'saved' && `Saved${savedJobs.length > 0 ? ` (${savedJobs.length})` : ''}`}
            {tab === 'applied' && `Applied${appliedJobs.length > 0 ? ` (${appliedJobs.length})` : ''}`}
          </button>
        ))}
      </div>

      {quickFilters.length > 0 && (
        <div style={styles.chipRow}>
          {quickFilters.map(chip => (
            <button
              key={`${chip.kind}-${chip.value}`}
              onClick={() => handleChipClick(chip)}
              style={{
                ...styles.chip,
                ...(isChipActive(chip) ? styles.chipActive : {}),
              }}
            >
              {chip.label}
            </button>
          ))}
          {(searchTerm || locationFilter !== 'all' || typeFilter !== 'all') && (
            <button
              onClick={() => { setSearchTerm(''); setLocationFilter('all'); setTypeFilter('all'); }}
              style={styles.chipClear}
            >
              ✕ Clear
            </button>
          )}
        </div>
      )}

      <div style={styles.controls}>
        <input
          type="text"
          placeholder="Search by title, company, or description"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={styles.searchInput}
        />
        <div style={styles.filters}>
          <select value={locationFilter} onChange={(e) => setLocationFilter(e.target.value)} style={styles.select}>
            {uniqueLocations.map(loc => (
              <option key={loc} value={loc}>{loc === 'all' ? 'All locations' : loc}</option>
            ))}
          </select>
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} style={styles.select}>
            {uniqueTypes.map(type => (
              <option key={type} value={type}>{type === 'all' ? 'All types' : type}</option>
            ))}
          </select>
        </div>
      </div>

      {filteredJobs.length === 0 ? (
        <div style={styles.emptyState}>
          <p style={styles.emptyText}>
            {activeTab === 'saved' && 'No saved jobs yet — click ♡ on any listing to save it'}
            {activeTab === 'applied' && 'No applied jobs yet — click "Apply Now" on any listing'}
            {activeTab === 'all' && 'No positions match your filters'}
          </p>
          {activeTab === 'all' && (
            <button
              onClick={() => { setSearchTerm(''); setLocationFilter('all'); setTypeFilter('all'); }}
              style={styles.clearButton}
            >
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <div style={styles.jobsList}>
          {filteredJobs.map((job, index) => {
            const isExpanded = expandedId === job.referencenumber;
            const isSaved = savedJobs.includes(job.referencenumber);
            const isApplied = appliedJobs.includes(job.referencenumber);
            const salary = formatSalary(job.salaryMin, job.salaryMax);

            return (
              <div
                key={job.referencenumber || index}
                style={{
                  ...styles.jobCard,
                  ...(isApplied ? styles.jobCardApplied : {}),
                  ...(isExpanded ? styles.jobCardExpanded : {}),
                }}
                onClick={() => setExpandedId(isExpanded ? null : job.referencenumber)}
              >
                {/* Header row: title + bookmark + date */}
                <div style={styles.jobHeader}>
                  <h3 style={styles.jobTitle}>{job.title}</h3>
                  <div style={styles.jobHeaderRight}>
                    <button
                      onClick={(e) => toggleSaved(job.referencenumber, e)}
                      style={{ ...styles.heartButton, color: isSaved ? '#E48715' : '#CCC' }}
                      aria-label={isSaved ? 'Remove from saved' : 'Save job'}
                    >
                      {isSaved ? '♥' : '♡'}
                    </button>
                    <span style={styles.jobDate}>{formatDate(job.date)}</span>
                  </div>
                </div>

                {/* Company + location */}
                <div style={styles.jobCompany}>
                  <span style={styles.companyName}>{job.company}</span>
                  {(job.city || job.state) && (
                    <>
                      <span style={styles.separator}>·</span>
                      <span>{[job.city, job.state].filter(Boolean).join(', ')}</span>
                    </>
                  )}
                </div>

                {/* Tags */}
                <div style={styles.jobMeta}>
                  {job.type && <span style={styles.tag}>{job.type}</span>}
                  {isValidLocationType(job.workLocationType) && <span style={styles.tag}>{job.workLocationType}</span>}
                  {job.seniority && <span style={styles.tag}>{job.seniority}</span>}
                  {isApplied && <span style={styles.appliedTag}>Applied</span>}
                </div>

                {/* Salary — visible in preview */}
                {salary && (
                  <div style={styles.salary}>
                    <span style={styles.salaryLabel}>Salary</span>
                    {salary}
                  </div>
                )}

                {/* Summary */}
                {job.summary && <p style={styles.jobSummary}>{job.summary}</p>}

                {/* Expanded: full description + actions */}
                {isExpanded && job.description && (
                  <div style={styles.descriptionPanel}>
                    <div
                      style={styles.descriptionContent}
                      dangerouslySetInnerHTML={{ __html: sanitizeHTML(job.description) }}
                    />
                  </div>
                )}

                {/* Footer: Apply Now (always) + I Applied tracker (expanded only) + expand cue */}
                <div style={styles.jobFooter}>
                  <div style={styles.jobFooterLeft}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        window.open(job.url, '_blank', 'noopener,noreferrer');
                      }}
                      style={styles.applyButton}
                    >
                      Apply Now →
                    </button>
                    {isExpanded && (
                      <button
                        onClick={(e) => toggleApplied(job.referencenumber, e)}
                        style={{
                          ...styles.trackerButton,
                          ...(isApplied ? styles.trackerButtonActive : {}),
                        }}
                      >
                        {isApplied ? '✓ I Applied' : 'I Applied'}
                      </button>
                    )}
                  </div>
                  <span style={styles.expandCue}>
                    {isExpanded ? 'Collapse ↑' : 'Details ↓'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <footer style={styles.footer}>
        <div style={styles.footerLine}></div>
        <p style={styles.footerText}>In Partnership with Jobstream™</p>
      </footer>
    </div>
  );
}

const styles = {
  container: {
    fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
    backgroundColor: '#FFFDFA',
    minHeight: '100vh',
    padding: '2rem 1.5rem',
    maxWidth: '1200px',
    margin: '0 auto',
  },

  header: {
    marginBottom: '1.5rem',
  },

  headerLine: {
    width: '80px',
    height: '3px',
    backgroundColor: '#000',
    marginBottom: '1.5rem',
  },

  title: {
    fontSize: '2.5rem',
    fontWeight: '600',
    margin: '0 0 0.25rem 0',
    color: '#000',
    letterSpacing: '-0.02em',
  },

  brandSubtitle: {
    fontSize: '0.875rem',
    fontWeight: '500',
    color: '#E48715',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    margin: '0 0 0.5rem 0',
  },

  subtitle: {
    fontSize: '1rem',
    color: '#666',
    margin: 0,
    fontWeight: '400',
  },

  feedAge: {
    color: '#999',
    fontSize: '0.8125rem',
    marginLeft: '0.75rem',
  },

  tabBar: {
    display: 'flex',
    marginBottom: '1.5rem',
    borderBottom: '2px solid #E5E5E5',
  },

  tabButton: {
    padding: '0.625rem 1.25rem',
    fontSize: '0.875rem',
    fontWeight: '500',
    border: 'none',
    borderBottom: '2px solid transparent',
    backgroundColor: 'transparent',
    cursor: 'pointer',
    fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
    color: '#666',
    marginBottom: '-2px',
  },

  tabButtonActive: {
    color: '#333333',
    borderBottomColor: '#E48715',
  },

  controls: {
    marginBottom: '2rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
  },

  searchInput: {
    width: '100%',
    padding: '0.875rem 1rem',
    fontSize: '0.9375rem',
    border: '2px solid #E5E5E5',
    backgroundColor: '#fff',
    borderRadius: 0,
    outline: 'none',
    fontFamily: 'inherit',
    boxSizing: 'border-box',
  },

  filters: {
    display: 'flex',
    gap: '0.75rem',
    flexWrap: 'wrap',
  },

  select: {
    padding: '0.75rem 1rem',
    fontSize: '0.875rem',
    border: '2px solid #E5E5E5',
    backgroundColor: '#fff',
    borderRadius: 0,
    outline: 'none',
    cursor: 'pointer',
    fontFamily: 'inherit',
    flex: '1',
    minWidth: '150px',
  },

  jobsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
  },

  jobCard: {
    backgroundColor: '#fff',
    border: '2px solid #E5E5E5',
    padding: '1.5rem',
    color: '#000',
    display: 'block',
    transition: 'border-color 0.2s',
    cursor: 'pointer',
  },

  jobCardApplied: {
    opacity: 0.65,
    borderColor: '#C8E6C9',
    backgroundColor: '#F9FBF9',
  },

  jobCardExpanded: {
    borderColor: '#E48715',
  },

  jobHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '0.75rem',
    gap: '1rem',
  },

  jobHeaderRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    flexShrink: 0,
  },

  heartButton: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontSize: '1.25rem',
    padding: '0.25rem',
    lineHeight: 1,
  },

  jobTitle: {
    fontSize: '1.25rem',
    fontWeight: '600',
    margin: 0,
    letterSpacing: '-0.01em',
    flex: 1,
  },

  jobDate: {
    fontSize: '0.8125rem',
    color: '#999',
    whiteSpace: 'nowrap',
  },

  jobCompany: {
    fontSize: '0.9375rem',
    color: '#666',
    marginBottom: '0.75rem',
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    flexWrap: 'wrap',
  },

  companyName: {
    fontWeight: '500',
  },

  separator: {
    color: '#CCC',
  },

  jobMeta: {
    display: 'flex',
    gap: '0.5rem',
    marginBottom: '0.75rem',
    flexWrap: 'wrap',
  },

  tag: {
    fontSize: '0.75rem',
    padding: '0.375rem 0.75rem',
    backgroundColor: '#F5F5F5',
    border: '1px solid #E5E5E5',
    textTransform: 'uppercase',
    letterSpacing: '0.03em',
    fontWeight: '500',
  },

  appliedTag: {
    fontSize: '0.75rem',
    padding: '0.375rem 0.75rem',
    backgroundColor: '#E8F5E9',
    border: '1px solid #A5D6A7',
    color: '#2E7D32',
    textTransform: 'uppercase',
    letterSpacing: '0.03em',
    fontWeight: '500',
  },

  chipRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '0.5rem',
    marginBottom: '1.25rem',
  },

  chip: {
    padding: '0.375rem 0.875rem',
    fontSize: '0.8125rem',
    fontWeight: '500',
    border: '1.5px solid #E5E5E5',
    backgroundColor: '#fff',
    color: '#555',
    cursor: 'pointer',
    fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
    borderRadius: '999px',
    whiteSpace: 'nowrap',
  },

  chipActive: {
    backgroundColor: '#E48715',
    borderColor: '#E48715',
    color: '#fff',
  },

  chipClear: {
    padding: '0.375rem 0.875rem',
    fontSize: '0.8125rem',
    fontWeight: '500',
    border: '1.5px solid #DDD',
    backgroundColor: 'transparent',
    color: '#999',
    cursor: 'pointer',
    fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
    borderRadius: '999px',
    whiteSpace: 'nowrap',
  },

  // Salary elevated to preview — shown before summary
  salary: {
    display: 'flex',
    alignItems: 'baseline',
    gap: '0.5rem',
    fontSize: '1rem',
    fontWeight: '700',
    color: '#2E7D32',
    marginBottom: '0.75rem',
  },

  salaryLabel: {
    fontSize: '0.6875rem',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    color: '#999',
  },

  jobSummary: {
    fontSize: '0.9375rem',
    lineHeight: '1.6',
    color: '#555',
    margin: '0 0 0.75rem 0',
  },

  descriptionPanel: {
    borderTop: '1px solid #F0F0F0',
    marginTop: '0.75rem',
    paddingTop: '1rem',
    marginBottom: '0.75rem',
  },

  descriptionContent: {
    fontSize: '0.9rem',
    lineHeight: '1.7',
    color: '#333333',
    overflowX: 'auto',
  },

  jobFooter: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: '0.75rem',
    borderTop: '1px solid #F0F0F0',
    gap: '0.75rem',
    flexWrap: 'wrap',
  },

  jobFooterLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    flexWrap: 'wrap',
  },

  // Primary CTA — solid Jet Black, always visible
  applyButton: {
    display: 'inline-block',
    padding: '0.5rem 1.25rem',
    fontSize: '0.875rem',
    fontWeight: '600',
    backgroundColor: '#333333',
    color: '#FFFDFA',
    border: '2px solid #333333',
    textDecoration: 'none',
    letterSpacing: '0.01em',
  },

  // Secondary tracker — ghost style, only shown when expanded
  trackerButton: {
    padding: '0.5rem 1rem',
    fontSize: '0.8125rem',
    fontWeight: '500',
    backgroundColor: 'transparent',
    color: '#999',
    border: '1px solid #DDD',
    cursor: 'pointer',
    fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
  },

  trackerButtonActive: {
    color: '#2E7D32',
    borderColor: '#A5D6A7',
    backgroundColor: '#F1FBF2',
  },

  expandCue: {
    fontSize: '0.8125rem',
    fontWeight: '500',
    color: '#999',
    flexShrink: 0,
  },

  emptyState: {
    textAlign: 'center',
    padding: '4rem 1rem',
    backgroundColor: '#fff',
    border: '2px solid #E5E5E5',
  },

  emptyText: {
    fontSize: '1rem',
    color: '#666',
    marginBottom: '1.5rem',
  },

  clearButton: {
    padding: '0.75rem 1.5rem',
    fontSize: '0.875rem',
    border: '2px solid #000',
    backgroundColor: '#000',
    color: '#FFFDFA',
    cursor: 'pointer',
    fontFamily: 'inherit',
    fontWeight: '500',
  },

  loadingContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '400px',
    gap: '1.5rem',
  },

  loadingBar: {
    width: '200px',
    height: '3px',
    backgroundColor: '#E5E5E5',
  },

  loadingText: {
    fontSize: '0.9375rem',
    color: '#666',
  },

  errorContainer: {
    textAlign: 'center',
    padding: '4rem 1rem',
    backgroundColor: '#fff',
    border: '2px solid #E5E5E5',
  },

  errorIcon: {
    fontSize: '3rem',
    marginBottom: '1rem',
  },

  errorTitle: {
    fontSize: '1.5rem',
    fontWeight: '600',
    margin: '0 0 0.5rem 0',
  },

  errorText: {
    fontSize: '0.9375rem',
    color: '#666',
    marginBottom: '1.5rem',
  },

  retryButton: {
    padding: '0.75rem 1.5rem',
    fontSize: '0.875rem',
    border: '2px solid #000',
    backgroundColor: '#000',
    color: '#FFFDFA',
    cursor: 'pointer',
    fontFamily: 'inherit',
    fontWeight: '500',
  },

  footer: {
    marginTop: '3rem',
    paddingTop: '2rem',
  },

  footerLine: {
    width: '80px',
    height: '2px',
    backgroundColor: '#E5E5E5',
    marginBottom: '1rem',
  },

  footerText: {
    fontSize: '0.8125rem',
    color: '#999',
    margin: 0,
  },
};
