import React, { useState, useEffect } from 'react';

export default function JobstreamWidget() {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [locationFilter, setLocationFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');

  // Change this to your deployed Vercel URL after deployment
  // Example: 'https://jobstream-widget.vercel.app/api/jobs'
  const API_URL = '/api/jobs';

  useEffect(() => {
    fetchJobs();
  }, []);

  const fetchJobs = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(API_URL);
      
      if (!response.ok) {
        throw new Error('Failed to fetch jobs');
      }

      const xmlText = await response.text();
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(xmlText, 'text/xml');

      const jobNodes = xmlDoc.getElementsByTagName('job');
      const parsedJobs = Array.from(jobNodes).map(job => ({
        title: job.getElementsByTagName('title')[0]?.textContent || '',
        company: job.getElementsByTagName('company')[0]?.textContent || '',
        city: job.getElementsByTagName('city')[0]?.textContent || '',
        state: job.getElementsByTagName('state')[0]?.textContent || '',
        type: job.getElementsByTagName('type')[0]?.textContent || '',
        summary: job.getElementsByTagName('summary')[0]?.textContent || '',
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

  const filteredJobs = jobs.filter(job => {
    const matchesSearch = job.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         job.company.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         job.summary.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesLocation = locationFilter === 'all' || 
                           job.workLocationType === locationFilter;
    
    const matchesType = typeFilter === 'all' || 
                       job.type === typeFilter;

    return matchesSearch && matchesLocation && matchesType;
  });

  const uniqueLocations = ['all', ...new Set(jobs.map(j => j.workLocationType).filter(Boolean))];
  const uniqueTypes = ['all', ...new Set(jobs.map(j => j.type).filter(Boolean))];

  const formatSalary = (min, max) => {
    if (!min && !max) return null;
    const formatter = new Intl.NumberFormat('en-US', { 
      style: 'currency', 
      currency: 'USD',
      maximumFractionDigits: 0 
    });
    if (min && max) return `${formatter.format(min)} - ${formatter.format(max)}`;
    if (min) return `From ${formatter.format(min)}`;
    if (max) return `Up to ${formatter.format(max)}`;
  };

  const formatDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now - date);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
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
          <button onClick={fetchJobs} style={styles.retryButton}>
            Try again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <div style={styles.headerLine}></div>
        <h1 style={styles.title}>Opportunities</h1>
        <p style={styles.subtitle}>{jobs.length} positions available</p>
      </header>

      <div style={styles.controls}>
        <input
          type="text"
          placeholder="Search by title, company, or description"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={styles.searchInput}
        />
        
        <div style={styles.filters}>
          <select 
            value={locationFilter} 
            onChange={(e) => setLocationFilter(e.target.value)}
            style={styles.select}
          >
            {uniqueLocations.map(loc => (
              <option key={loc} value={loc}>
                {loc === 'all' ? 'All locations' : loc}
              </option>
            ))}
          </select>

          <select 
            value={typeFilter} 
            onChange={(e) => setTypeFilter(e.target.value)}
            style={styles.select}
          >
            {uniqueTypes.map(type => (
              <option key={type} value={type}>
                {type === 'all' ? 'All types' : type}
              </option>
            ))}
          </select>
        </div>
      </div>

      {filteredJobs.length === 0 ? (
        <div style={styles.emptyState}>
          <p style={styles.emptyText}>No positions match your filters</p>
          <button 
            onClick={() => {
              setSearchTerm('');
              setLocationFilter('all');
              setTypeFilter('all');
            }}
            style={styles.clearButton}
          >
            Clear filters
          </button>
        </div>
      ) : (
        <div style={styles.jobsList}>
          {filteredJobs.map((job, index) => (
            <a 
              key={index} 
              href={job.url} 
              target="_blank" 
              rel="noopener noreferrer"
              style={styles.jobCard}
            >
              <div style={styles.jobHeader}>
                <h3 style={styles.jobTitle}>{job.title}</h3>
                <span style={styles.jobDate}>{formatDate(job.date)}</span>
              </div>
              
              <div style={styles.jobCompany}>
                <span style={styles.companyName}>{job.company}</span>
                <span style={styles.separator}>·</span>
                <span style={styles.location}>
                  {job.city}, {job.state}
                </span>
              </div>

              <div style={styles.jobMeta}>
                {job.type && (
                  <span style={styles.tag}>{job.type}</span>
                )}
                {job.workLocationType && (
                  <span style={styles.tag}>{job.workLocationType}</span>
                )}
                {job.seniority && (
                  <span style={styles.tag}>{job.seniority}</span>
                )}
              </div>

              {job.summary && (
                <p style={styles.jobSummary}>{job.summary}</p>
              )}

              {(job.salaryMin || job.salaryMax) && (
                <div style={styles.salary}>
                  {formatSalary(job.salaryMin, job.salaryMax)}
                </div>
              )}

              <div style={styles.jobFooter}>
                <span style={styles.viewLink}>View details →</span>
              </div>
            </a>
          ))}
        </div>
      )}

      <footer style={styles.footer}>
        <div style={styles.footerLine}></div>
        <p style={styles.footerText}>
          Powered by Jobstream
        </p>
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
    marginBottom: '2.5rem',
    position: 'relative',
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
    margin: '0 0 0.5rem 0',
    color: '#000',
    letterSpacing: '-0.02em',
  },

  subtitle: {
    fontSize: '1rem',
    color: '#666',
    margin: 0,
    fontWeight: '400',
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
    transition: 'border-color 0.2s',
    fontFamily: 'inherit',
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
    textDecoration: 'none',
    color: '#000',
    display: 'block',
    transition: 'all 0.2s',
    position: 'relative',
  },

  jobHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '0.75rem',
    gap: '1rem',
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
    marginBottom: '1rem',
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

  location: {},

  jobMeta: {
    display: 'flex',
    gap: '0.5rem',
    marginBottom: '1rem',
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

  jobSummary: {
    fontSize: '0.9375rem',
    lineHeight: '1.6',
    color: '#333',
    margin: '0 0 1rem 0',
  },

  salary: {
    fontSize: '0.9375rem',
    fontWeight: '600',
    color: '#000',
    marginBottom: '1rem',
  },

  jobFooter: {
    display: 'flex',
    justifyContent: 'flex-end',
    paddingTop: '0.75rem',
    borderTop: '1px solid #F0F0F0',
  },

  viewLink: {
    fontSize: '0.875rem',
    fontWeight: '500',
    color: '#666',
    transition: 'color 0.2s',
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
    transition: 'all 0.2s',
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
    position: 'relative',
    overflow: 'hidden',
    '&::after': {
      content: '""',
      position: 'absolute',
      top: 0,
      left: '-100%',
      width: '100%',
      height: '100%',
      backgroundColor: '#000',
      animation: 'loading 1.5s infinite',
    },
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
    transition: 'all 0.2s',
  },

  footer: {
    marginTop: '3rem',
    paddingTop: '2rem',
    position: 'relative',
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
