import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';

// ─── Constants ────────────────────────────────────────────────────────────────
const GEOCACHE_KEY = 'jobstream_geocache';
const GEOCACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days

// ─── Storage helpers ──────────────────────────────────────────────────────────
function loadFromStorage(key, defaultValue) {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? defaultValue : JSON.parse(raw);
  } catch { return defaultValue; }
}
function saveToStorage(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}
function loadGeoCache() {
  try {
    const raw = localStorage.getItem(GEOCACHE_KEY);
    if (!raw) return {};
    const cache = JSON.parse(raw);
    const now = Date.now();
    const valid = {};
    Object.entries(cache).forEach(([k, v]) => { if (v.expires > now) valid[k] = v; });
    return valid;
  } catch { return {}; }
}
function saveGeoCache(cache) {
  try { localStorage.setItem(GEOCACHE_KEY, JSON.stringify(cache)); } catch {}
}

// ─── HTML sanitizer ───────────────────────────────────────────────────────────
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

// ─── Type normalizer ──────────────────────────────────────────────────────────
// Collapses "Full time / FULLTIME / BF - Full-Time Benefited" → "Full-time"
function normalizeJobType(raw) {
  if (!raw) return '';
  // Strip code prefixes like "BF - ", "PT - ", "FT - "
  let s = raw.replace(/^[A-Z]{1,3}\s*[-–]\s*/i, '').trim();
  // Strip everything after "/" (e.g. "/ Standard", "/ Benefited")
  s = s.split('/')[0].trim();
  // Strip trailing descriptors
  s = s.replace(/\s+(benefited|standard|regular|exempt|non-exempt)$/i, '').trim();

  const n = s.toLowerCase().replace(/[\s\-_]/g, '');
  if (n.includes('fulltime') || n === 'ft') return 'Full-time';
  if (n.includes('parttime') || n === 'pt') return 'Part-time';
  if (n.includes('contract')) return 'Contract';
  if (n.includes('intern')) return 'Internship';
  if (n.includes('freelance')) return 'Freelance';
  if (n.includes('temp')) return 'Temporary';
  if (n.includes('casual')) return 'Casual';
  if (n.includes('seasonal')) return 'Seasonal';
  if (n.includes('volunteer')) return 'Volunteer';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ─── Salary extractor from description HTML ───────────────────────────────────
function extractSalaryFromText(html) {
  if (!html) return { min: null, max: null };
  const text = html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ');

  const toNum = (s, hasK) => {
    let n = parseFloat(s.replace(/,/g, ''));
    if (hasK) n *= 1000;
    return n;
  };

  // Range: $X[k] - $Y[k]
  const rng = text.match(/\$\s*([\d,]+(?:\.\d+)?)\s*([kK])?\s*(?:[-–—]|to)\s*\$?\s*([\d,]+(?:\.\d+)?)\s*([kK])?/);
  if (rng) {
    const min = toNum(rng[1], !!rng[2]);
    const max = toNum(rng[3], !!rng[4] || (!!rng[2] && parseFloat(rng[3].replace(/,/g, '')) < 1000));
    if (min > 10000 && max > min && max < 2000000) return { min: Math.round(min), max: Math.round(max) };
  }

  // Single /year or /annual
  const yr = text.match(/\$\s*([\d,]+(?:\.\d+)?)\s*([kK])?\s*(?:\/\s*(?:yr|year|annual|annum)|per\s+(?:year|annum))/i);
  if (yr) {
    const val = toNum(yr[1], !!yr[2]);
    if (val > 10000 && val < 2000000) return { min: Math.round(val), max: null };
  }

  // Hourly → annualise at 2080 hrs
  const hr = text.match(/\$\s*([\d,]+(?:\.\d+)?)\s*(?:\/\s*(?:hr|hour)|per\s+hour)/i);
  if (hr) {
    const rate = parseFloat(hr[1].replace(/,/g, ''));
    if (rate > 5 && rate < 500) return { min: Math.round(rate * 2080), max: null };
  }

  return { min: null, max: null };
}

// ─── Map view ─────────────────────────────────────────────────────────────────
function MapView({ jobs }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const geoCacheRef = useRef(loadGeoCache());
  const [geocodedCount, setGeocodedCount] = useState(0);
  const [totalToGeocode, setTotalToGeocode] = useState(0);
  const [status, setStatus] = useState('init'); // init | geocoding | ready

  const locationGroups = useMemo(() => {
    const groups = {};
    jobs.forEach(job => {
      const loc = [job.city, job.state].filter(Boolean).join(', ');
      if (!loc || loc.trim() === ',') return;
      if (!groups[loc]) groups[loc] = [];
      groups[loc].push(job);
    });
    return groups;
  }, [jobs]);

  const sortedLocations = useMemo(() =>
    Object.entries(locationGroups)
      .sort((a, b) => b[1].length - a[1].length)
      .slice(0, 60)
      .map(([loc]) => loc),
    [locationGroups]
  );

  const addMarker = useCallback((L, map, loc, locJobs, coords) => {
    const count = locJobs.length;
    const size = count >= 10 ? 38 : 30;
    const icon = L.divIcon({
      className: '',
      html: `<div style="
        background:#E48715;color:#fff;border-radius:50%;
        width:${size}px;height:${size}px;
        display:flex;align-items:center;justify-content:center;
        font-family:Inter,sans-serif;font-size:${count >= 10 ? 11 : 12}px;font-weight:700;
        border:2.5px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.22);
        cursor:pointer;
      ">${count}</div>`,
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2],
    });

    const popupRows = locJobs.slice(0, 5).map(j => {
      const sal = j.salaryMin && j.salaryMax
        ? `$${Number(j.salaryMin).toLocaleString()} – $${Number(j.salaryMax).toLocaleString()}`
        : j.salaryMin ? `From $${Number(j.salaryMin).toLocaleString()}`
        : j.salaryMax ? `Up to $${Number(j.salaryMax).toLocaleString()}` : '';
      const safeUrl = j.url.replace(/'/g, '%27');
      return `
        <div style="padding:7px 0;border-bottom:1px solid #f5f5f5;">
          <div style="font-weight:600;font-size:0.8rem;color:#222;line-height:1.3;margin-bottom:2px;">${j.title}</div>
          <div style="font-size:0.7rem;color:#666;margin-bottom:${sal ? '3px' : '5px'};">${j.company}</div>
          ${sal ? `<div style="font-size:0.7rem;color:#2E7D32;font-weight:600;margin-bottom:5px;">${sal}</div>` : ''}
          <button onclick="window.open('${safeUrl}','_blank','noopener,noreferrer')"
            style="font-size:0.7rem;font-weight:600;color:#FFFDFA;background:#333333;border:none;padding:4px 12px;cursor:pointer;font-family:Inter,sans-serif;">
            Apply Now →
          </button>
        </div>`;
    }).join('');

    const extra = count > 5
      ? `<div style="font-size:0.7rem;color:#999;padding-top:6px;">+${count - 5} more positions in this area</div>`
      : '';

    const popupHTML = `
      <div style="font-family:Inter,sans-serif;min-width:210px;max-width:260px;padding:2px;">
        <div style="font-weight:700;font-size:0.875rem;color:#333;margin-bottom:3px;">${loc}</div>
        <div style="font-size:0.75rem;color:#E48715;font-weight:500;margin-bottom:10px;padding-bottom:8px;border-bottom:1px solid #f0f0f0;">
          ${count} open position${count !== 1 ? 's' : ''}
        </div>
        ${popupRows}${extra}
      </div>`;

    const marker = L.marker([coords.lat, coords.lng], { icon });
    marker.bindPopup(popupHTML, { maxWidth: 280, minWidth: 210 });
    marker.addTo(map);
    markersRef.current.push(marker);
  }, []);

  useEffect(() => {
    const L = window.L;
    if (!L || !containerRef.current) return;

    // Init map once
    if (!mapRef.current) {
      mapRef.current = L.map(containerRef.current, { preferCanvas: true });
      L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution: '© <a href="https://openstreetmap.org/copyright">OpenStreetMap</a> © <a href="https://carto.com/">CARTO</a>',
        maxZoom: 19,
      }).addTo(mapRef.current);
    }

    const map = mapRef.current;

    // Clear old markers
    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];

    if (!sortedLocations.length) return;

    const cache = geoCacheRef.current;
    const bounds = [];

    // Render cached markers immediately
    sortedLocations.forEach(loc => {
      if (cache[loc]) {
        addMarker(L, map, loc, locationGroups[loc], cache[loc]);
        bounds.push([cache[loc].lat, cache[loc].lng]);
      }
    });

    if (bounds.length > 0) {
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 8 });
    } else {
      map.setView([39.5, -98.35], 4);
    }

    const uncached = sortedLocations.filter(loc => !cache[loc]);
    if (!uncached.length) { setStatus('ready'); return; }

    setTotalToGeocode(uncached.length);
    setStatus('geocoding');
    let cancelled = false;
    let idx = 0;

    const geocodeNext = async () => {
      if (cancelled || idx >= uncached.length) {
        if (!cancelled) setStatus('ready');
        return;
      }
      const loc = uncached[idx++];
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(loc)}&format=json&limit=1&countrycodes=us,ca`,
          { headers: { 'Accept-Language': 'en' } }
        );
        const data = await res.json();
        if (data[0] && !cancelled) {
          const coords = {
            lat: parseFloat(data[0].lat),
            lng: parseFloat(data[0].lon),
            expires: Date.now() + GEOCACHE_TTL,
          };
          cache[loc] = coords;
          geoCacheRef.current = { ...cache };
          saveGeoCache(geoCacheRef.current);
          addMarker(L, map, loc, locationGroups[loc], coords);
          setGeocodedCount(c => c + 1);
        }
      } catch {}
      if (!cancelled) {
        setTimeout(geocodeNext, 1100); // respect Nominatim 1 req/sec
      }
    };

    geocodeNext();
    return () => { cancelled = true; };
  }, [sortedLocations, locationGroups, addMarker]);

  // Cleanup on unmount
  useEffect(() => () => {
    if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }
  }, []);

  return (
    <div style={{ border: '2px solid #E5E5E5', overflow: 'hidden' }}>
      {status === 'geocoding' && (
        <div style={{
          padding: '0.625rem 1rem',
          backgroundColor: '#FEF7E7',
          borderBottom: '1px solid #F0DFA0',
          fontSize: '0.8125rem',
          color: '#8a5e00',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
        }}>
          📍 Mapping locations — {geocodedCount} of {totalToGeocode} geocoded
          <span style={{ color: '#bfa060', marginLeft: 'auto' }}>Results cache for 7 days</span>
        </div>
      )}
      {status === 'ready' && (
        <div style={{
          padding: '0.5rem 1rem',
          backgroundColor: '#F9F9F9',
          borderBottom: '1px solid #EFEFEF',
          fontSize: '0.8125rem',
          color: '#999',
        }}>
          {sortedLocations.length} locations · click a marker to see open roles
        </div>
      )}
      <div ref={containerRef} style={{ width: '100%', height: '540px' }} />
    </div>
  );
}

// ─── Main widget ──────────────────────────────────────────────────────────────
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
  useEffect(() => { fetchJobs(); }, []);

  const fetchJobs = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(API_URL);
      if (!response.ok) throw new Error('Failed to fetch jobs');
      const xmlText = await response.text();
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(xmlText, 'text/xml');
      setFeedDate(xmlDoc.getElementsByTagName('lastBuildDate')[0]?.textContent || '');

      const jobNodes = xmlDoc.getElementsByTagName('job');
      const parsedJobs = Array.from(jobNodes).map(job => {
        const g = tag => job.getElementsByTagName(tag)[0]?.textContent || '';
        const rawType = g('type');
        const description = g('description');

        // Structured salary fields first; fall back to description parsing
        let salaryMin = g('estimated_salary_min');
        let salaryMax = g('estimated_salary_max');
        if (!salaryMin && !salaryMax && description) {
          const extracted = extractSalaryFromText(description);
          if (extracted.min) salaryMin = String(extracted.min);
          if (extracted.max) salaryMax = String(extracted.max);
        }

        return {
          referencenumber: g('referencenumber'),
          title: g('title'),
          company: g('company'),
          city: g('city'),
          state: g('state'),
          type: normalizeJobType(rawType),
          summary: g('summary'),
          description,
          url: g('url'),
          date: g('date'),
          workLocationType: g('work_location_type'),
          seniority: g('job_seniority'),
          salaryMin,
          salaryMax,
        };
      });

      setJobs(parsedJobs);
      setLoading(false);
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  const toggleSaved = (refNum, e) => {
    e.preventDefault(); e.stopPropagation();
    const next = savedJobs.includes(refNum) ? savedJobs.filter(id => id !== refNum) : [...savedJobs, refNum];
    setSavedJobs(next); saveToStorage('jobstream_saved', next);
  };
  const toggleApplied = (refNum, e) => {
    e.preventDefault(); e.stopPropagation();
    const next = appliedJobs.includes(refNum) ? appliedJobs.filter(id => id !== refNum) : [...appliedJobs, refNum];
    setAppliedJobs(next); saveToStorage('jobstream_applied', next);
  };

  const isValidLocationType = val =>
    val && val.toLowerCase() !== 'not specified' && val.trim() !== '';

  const filteredJobs = jobs.filter(job => {
    if (activeTab === 'saved' && !savedJobs.includes(job.referencenumber)) return false;
    if (activeTab === 'applied' && !appliedJobs.includes(job.referencenumber)) return false;
    const q = searchTerm.toLowerCase();
    const matchesSearch = !q || job.title.toLowerCase().includes(q) ||
      job.company.toLowerCase().includes(q) || job.summary.toLowerCase().includes(q);
    const matchesLocation = locationFilter === 'all' || job.workLocationType === locationFilter;
    const matchesType = typeFilter === 'all' || job.type === typeFilter;
    return matchesSearch && matchesLocation && matchesType;
  });

  const uniqueLocations = useMemo(() =>
    ['all', ...new Set(jobs.map(j => j.workLocationType).filter(isValidLocationType))],
    [jobs]
  );
  const uniqueTypes = useMemo(() =>
    ['all', ...new Set(jobs.map(j => j.type).filter(Boolean))],
    [jobs]
  );

  const formatSalary = (min, max) => {
    if (!min && !max) return null;
    const fmt = n => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
    if (min && max) return `${fmt(min)} – ${fmt(max)}`;
    if (min) return `From ${fmt(min)}`;
    return `Up to ${fmt(max)}`;
  };

  const formatDate = dateString => {
    if (!dateString) return '';
    const d = new Date(dateString), now = new Date();
    const days = Math.ceil(Math.abs(now - d) / 86400000);
    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days}d ago`;
    if (days < 30) return `${Math.floor(days / 7)}w ago`;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const formatFeedAge = dateString => {
    if (!dateString) return '';
    const d = new Date(dateString);
    if (isNaN(d)) return '';
    const ms = Date.now() - d.getTime();
    const mins = Math.floor(ms / 60000);
    if (mins < 2) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };

  // ─── Quick-filter chips ──────────────────────────────────────────────────
  const quickFilters = useMemo(() => {
    if (!jobs.length) return [];
    const STOP = new Set(['a','an','the','and','or','of','to','in','for','with','at','by',
      'from','on','as','is','are','be','was','were','will','have','has','had',
      'not','but','so','if','it','its','this','that','we','you','they',
      'our','your','their','ii','iii','iv']);
    const freq = {};
    jobs.forEach(job => {
      job.title.toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/)
        .filter(w => w.length > 2 && !STOP.has(w))
        .forEach(w => { freq[w] = (freq[w] || 0) + 1; });
    });
    const topKeywords = Object.entries(freq)
      .sort((a, b) => b[1] - a[1]).slice(0, 8)
      .map(([w]) => ({ label: w.charAt(0).toUpperCase() + w.slice(1), kind: 'keyword', value: w }));

    const locOrder = ['remote', 'hybrid', 'on-site', 'onsite', 'in-office', 'in office'];
    const locationChips = uniqueLocations.filter(v => v !== 'all')
      .sort((a, b) => {
        const ai = locOrder.indexOf(a.toLowerCase()), bi = locOrder.indexOf(b.toLowerCase());
        return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
      })
      .map(v => ({ label: v, kind: 'location', value: v }));

    const typeChips = uniqueTypes.filter(v => v !== 'all')
      .map(v => ({ label: v, kind: 'type', value: v }));

    return [...locationChips, ...typeChips, ...topKeywords];
  }, [jobs, uniqueLocations, uniqueTypes]);

  const isChipActive = chip => {
    if (chip.kind === 'location') return locationFilter === chip.value;
    if (chip.kind === 'type') return typeFilter === chip.value;
    return searchTerm.toLowerCase() === chip.value.toLowerCase();
  };
  const handleChipClick = chip => {
    if (chip.kind === 'location') setLocationFilter(isChipActive(chip) ? 'all' : chip.value);
    else if (chip.kind === 'type') setTypeFilter(isChipActive(chip) ? 'all' : chip.value);
    else setSearchTerm(isChipActive(chip) ? '' : chip.label);
  };

  const hasActiveFilter = searchTerm || locationFilter !== 'all' || typeFilter !== 'all';

  // ─── Loading / error states ──────────────────────────────────────────────
  if (loading) return (
    <div style={styles.container}>
      <div style={styles.loadingContainer}>
        <div style={styles.loadingBar} />
        <p style={styles.loadingText}>Loading opportunities</p>
      </div>
    </div>
  );

  if (error) return (
    <div style={styles.container}>
      <div style={styles.errorContainer}>
        <div style={styles.errorIcon}>⚠</div>
        <h3 style={styles.errorTitle}>Unable to load jobs</h3>
        <p style={styles.errorText}>{error}</p>
        <button onClick={fetchJobs} style={styles.retryButton}>Try again</button>
      </div>
    </div>
  );

  // ─── Render ──────────────────────────────────────────────────────────────
  return (
    <div style={styles.container}>

      {/* Header */}
      <header style={styles.header}>
        <div style={styles.headerLine} />
        <h1 style={styles.title}>Job Opportunities</h1>
        <p style={styles.brandSubtitle}>Powered by Jobstream™</p>
        <p style={styles.subtitle}>
          {activeTab !== 'map' && `${filteredJobs.length} of ${jobs.length} positions`}
          {activeTab === 'map' && `${jobs.length} positions`}
          {feedDate && <span style={styles.feedAge}>· Updated {formatFeedAge(feedDate)}</span>}
        </p>
      </header>

      {/* Tab bar */}
      <div style={styles.tabBar}>
        {['all', 'saved', 'applied', 'map'].map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            style={{ ...styles.tabButton, ...(activeTab === tab ? styles.tabButtonActive : {}) }}>
            {tab === 'all' && 'All Jobs'}
            {tab === 'saved' && `Saved${savedJobs.length ? ` (${savedJobs.length})` : ''}`}
            {tab === 'applied' && `Applied${appliedJobs.length ? ` (${appliedJobs.length})` : ''}`}
            {tab === 'map' && '🗺 Map'}
          </button>
        ))}
      </div>

      {/* Map view */}
      {activeTab === 'map' && <MapView jobs={jobs} />}

      {/* List views */}
      {activeTab !== 'map' && (
        <>
          {/* Chips */}
          {quickFilters.length > 0 && (
            <div style={styles.chipRow}>
              {quickFilters.map(chip => (
                <button key={`${chip.kind}-${chip.value}`} onClick={() => handleChipClick(chip)}
                  style={{ ...styles.chip, ...(isChipActive(chip) ? styles.chipActive : {}) }}>
                  {chip.label}
                </button>
              ))}
              {hasActiveFilter && (
                <button onClick={() => { setSearchTerm(''); setLocationFilter('all'); setTypeFilter('all'); }}
                  style={styles.chipClear}>✕ Clear</button>
              )}
            </div>
          )}

          {/* Search + dropdowns */}
          <div style={styles.controls}>
            <input type="text" placeholder="Search by title, company, or description"
              value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
              style={styles.searchInput} />
            <div style={styles.filters}>
              <select value={locationFilter} onChange={e => setLocationFilter(e.target.value)} style={styles.select}>
                {uniqueLocations.map(loc => (
                  <option key={loc} value={loc}>{loc === 'all' ? 'All locations' : loc}</option>
                ))}
              </select>
              <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} style={styles.select}>
                {uniqueTypes.map(type => (
                  <option key={type} value={type}>{type === 'all' ? 'All types' : type}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Job cards */}
          {filteredJobs.length === 0 ? (
            <div style={styles.emptyState}>
              <p style={styles.emptyText}>
                {activeTab === 'saved' && 'No saved jobs yet — click ♡ on any listing to save it'}
                {activeTab === 'applied' && 'No applied jobs yet — click "Apply Now" on any listing'}
                {activeTab === 'all' && 'No positions match your filters'}
              </p>
              {activeTab === 'all' && (
                <button onClick={() => { setSearchTerm(''); setLocationFilter('all'); setTypeFilter('all'); }}
                  style={styles.clearButton}>Clear filters</button>
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
                  <div key={job.referencenumber || index}
                    style={{ ...styles.jobCard, ...(isApplied ? styles.jobCardApplied : {}), ...(isExpanded ? styles.jobCardExpanded : {}) }}
                    onClick={() => setExpandedId(isExpanded ? null : job.referencenumber)}>

                    {/* Title row */}
                    <div style={styles.jobHeader}>
                      <h3 style={styles.jobTitle}>{job.title}</h3>
                      <div style={styles.jobHeaderRight}>
                        <button onClick={e => toggleSaved(job.referencenumber, e)}
                          style={{ ...styles.heartButton, color: isSaved ? '#E48715' : '#CCC' }}
                          aria-label={isSaved ? 'Remove from saved' : 'Save job'}>
                          {isSaved ? '♥' : '♡'}
                        </button>
                        <span style={styles.jobDate}>{formatDate(job.date)}</span>
                      </div>
                    </div>

                    {/* Company + location */}
                    <div style={styles.jobCompany}>
                      <span style={styles.companyName}>{job.company}</span>
                      {(job.city || job.state) && (
                        <><span style={styles.separator}>·</span>
                          <span>{[job.city, job.state].filter(Boolean).join(', ')}</span></>
                      )}
                    </div>

                    {/* Tags */}
                    <div style={styles.jobMeta}>
                      {job.type && <span style={styles.tag}>{job.type}</span>}
                      {isValidLocationType(job.workLocationType) && <span style={styles.tag}>{job.workLocationType}</span>}
                      {job.seniority && <span style={styles.tag}>{job.seniority}</span>}
                      {isApplied && <span style={styles.appliedTag}>Applied</span>}
                    </div>

                    {/* Salary */}
                    {salary && (
                      <div style={styles.salary}>
                        <span style={styles.salaryLabel}>Salary</span>{salary}
                      </div>
                    )}

                    {/* Summary */}
                    {job.summary && <p style={styles.jobSummary}>{job.summary}</p>}

                    {/* Expanded description */}
                    {isExpanded && job.description && (
                      <div style={styles.descriptionPanel}>
                        <div style={styles.descriptionContent}
                          dangerouslySetInnerHTML={{ __html: sanitizeHTML(job.description) }} />
                      </div>
                    )}

                    {/* Footer */}
                    <div style={styles.jobFooter}>
                      <div style={styles.jobFooterLeft}>
                        <button
                          onClick={e => { e.stopPropagation(); window.open(job.url, '_blank', 'noopener,noreferrer'); }}
                          style={styles.applyButton}>
                          Apply Now →
                        </button>
                        {isExpanded && (
                          <button onClick={e => toggleApplied(job.referencenumber, e)}
                            style={{ ...styles.trackerButton, ...(isApplied ? styles.trackerButtonActive : {}) }}>
                            {isApplied ? '✓ I Applied' : 'I Applied'}
                          </button>
                        )}
                      </div>
                      <span style={styles.expandCue}>{isExpanded ? 'Collapse ↑' : 'Details ↓'}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      <footer style={styles.footer}>
        <div style={styles.footerLine} />
        <p style={styles.footerText}>In Partnership with Jobstream™</p>
      </footer>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = {
  container: {
    fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
    backgroundColor: '#FFFDFA',
    minHeight: '100vh',
    padding: '2rem 1.5rem',
    maxWidth: '1200px',
    margin: '0 auto',
  },
  header: { marginBottom: '1.5rem' },
  headerLine: { width: '80px', height: '3px', backgroundColor: '#000', marginBottom: '1.5rem' },
  title: { fontSize: '2.5rem', fontWeight: '600', margin: '0 0 0.25rem 0', color: '#000', letterSpacing: '-0.02em' },
  brandSubtitle: { fontSize: '0.875rem', fontWeight: '500', color: '#E48715', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 0.5rem 0' },
  subtitle: { fontSize: '1rem', color: '#666', margin: 0, fontWeight: '400' },
  feedAge: { color: '#999', fontSize: '0.8125rem', marginLeft: '0.75rem' },

  tabBar: { display: 'flex', marginBottom: '1.5rem', borderBottom: '2px solid #E5E5E5' },
  tabButton: {
    padding: '0.625rem 1.25rem', fontSize: '0.875rem', fontWeight: '500',
    border: 'none', borderBottom: '2px solid transparent', backgroundColor: 'transparent',
    cursor: 'pointer', fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
    color: '#666', marginBottom: '-2px',
  },
  tabButtonActive: { color: '#333333', borderBottomColor: '#E48715' },

  chipRow: { display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1.25rem' },
  chip: {
    padding: '0.375rem 0.875rem', fontSize: '0.8125rem', fontWeight: '500',
    border: '1.5px solid #E5E5E5', backgroundColor: '#fff', color: '#555',
    cursor: 'pointer', fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
    borderRadius: '999px', whiteSpace: 'nowrap',
  },
  chipActive: { backgroundColor: '#E48715', borderColor: '#E48715', color: '#fff' },
  chipClear: {
    padding: '0.375rem 0.875rem', fontSize: '0.8125rem', fontWeight: '500',
    border: '1.5px solid #DDD', backgroundColor: 'transparent', color: '#999',
    cursor: 'pointer', fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
    borderRadius: '999px', whiteSpace: 'nowrap',
  },

  controls: { marginBottom: '2rem', display: 'flex', flexDirection: 'column', gap: '1rem' },
  searchInput: {
    width: '100%', padding: '0.875rem 1rem', fontSize: '0.9375rem',
    border: '2px solid #E5E5E5', backgroundColor: '#fff', borderRadius: 0,
    outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
  },
  filters: { display: 'flex', gap: '0.75rem', flexWrap: 'wrap' },
  select: {
    padding: '0.75rem 1rem', fontSize: '0.875rem', border: '2px solid #E5E5E5',
    backgroundColor: '#fff', borderRadius: 0, outline: 'none',
    cursor: 'pointer', fontFamily: 'inherit', flex: '1', minWidth: '150px',
  },

  jobsList: { display: 'flex', flexDirection: 'column', gap: '1rem' },
  jobCard: {
    backgroundColor: '#fff', border: '2px solid #E5E5E5', padding: '1.5rem',
    color: '#000', display: 'block', transition: 'border-color 0.2s', cursor: 'pointer',
  },
  jobCardApplied: { opacity: 0.65, borderColor: '#C8E6C9', backgroundColor: '#F9FBF9' },
  jobCardExpanded: { borderColor: '#E48715' },

  jobHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem', gap: '1rem' },
  jobHeaderRight: { display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 },
  heartButton: { background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.25rem', padding: '0.25rem', lineHeight: 1 },
  jobTitle: { fontSize: '1.25rem', fontWeight: '600', margin: 0, letterSpacing: '-0.01em', flex: 1 },
  jobDate: { fontSize: '0.8125rem', color: '#999', whiteSpace: 'nowrap' },

  jobCompany: { fontSize: '0.9375rem', color: '#666', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' },
  companyName: { fontWeight: '500' },
  separator: { color: '#CCC' },

  jobMeta: { display: 'flex', gap: '0.5rem', marginBottom: '0.75rem', flexWrap: 'wrap' },
  tag: { fontSize: '0.75rem', padding: '0.375rem 0.75rem', backgroundColor: '#F5F5F5', border: '1px solid #E5E5E5', textTransform: 'uppercase', letterSpacing: '0.03em', fontWeight: '500' },
  appliedTag: { fontSize: '0.75rem', padding: '0.375rem 0.75rem', backgroundColor: '#E8F5E9', border: '1px solid #A5D6A7', color: '#2E7D32', textTransform: 'uppercase', letterSpacing: '0.03em', fontWeight: '500' },

  salary: { display: 'flex', alignItems: 'baseline', gap: '0.5rem', fontSize: '1rem', fontWeight: '700', color: '#2E7D32', marginBottom: '0.75rem' },
  salaryLabel: { fontSize: '0.6875rem', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.06em', color: '#999' },

  jobSummary: { fontSize: '0.9375rem', lineHeight: '1.6', color: '#555', margin: '0 0 0.75rem 0' },
  descriptionPanel: { borderTop: '1px solid #F0F0F0', marginTop: '0.75rem', paddingTop: '1rem', marginBottom: '0.75rem' },
  descriptionContent: { fontSize: '0.9rem', lineHeight: '1.7', color: '#333333', overflowX: 'auto' },

  jobFooter: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '0.75rem', borderTop: '1px solid #F0F0F0', gap: '0.75rem', flexWrap: 'wrap' },
  jobFooterLeft: { display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' },
  applyButton: { padding: '0.5rem 1.25rem', fontSize: '0.875rem', fontWeight: '600', backgroundColor: '#333333', color: '#FFFDFA', border: '2px solid #333333', cursor: 'pointer', fontFamily: 'Inter, system-ui, -apple-system, sans-serif', letterSpacing: '0.01em' },
  trackerButton: { padding: '0.5rem 1rem', fontSize: '0.8125rem', fontWeight: '500', backgroundColor: 'transparent', color: '#999', border: '1px solid #DDD', cursor: 'pointer', fontFamily: 'Inter, system-ui, -apple-system, sans-serif' },
  trackerButtonActive: { color: '#2E7D32', borderColor: '#A5D6A7', backgroundColor: '#F1FBF2' },
  expandCue: { fontSize: '0.8125rem', fontWeight: '500', color: '#999', flexShrink: 0 },

  emptyState: { textAlign: 'center', padding: '4rem 1rem', backgroundColor: '#fff', border: '2px solid #E5E5E5' },
  emptyText: { fontSize: '1rem', color: '#666', marginBottom: '1.5rem' },
  clearButton: { padding: '0.75rem 1.5rem', fontSize: '0.875rem', border: '2px solid #000', backgroundColor: '#000', color: '#FFFDFA', cursor: 'pointer', fontFamily: 'inherit', fontWeight: '500' },

  loadingContainer: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '400px', gap: '1.5rem' },
  loadingBar: { width: '200px', height: '3px', backgroundColor: '#E5E5E5' },
  loadingText: { fontSize: '0.9375rem', color: '#666' },

  errorContainer: { textAlign: 'center', padding: '4rem 1rem', backgroundColor: '#fff', border: '2px solid #E5E5E5' },
  errorIcon: { fontSize: '3rem', marginBottom: '1rem' },
  errorTitle: { fontSize: '1.5rem', fontWeight: '600', margin: '0 0 0.5rem 0' },
  errorText: { fontSize: '0.9375rem', color: '#666', marginBottom: '1.5rem' },
  retryButton: { padding: '0.75rem 1.5rem', fontSize: '0.875rem', border: '2px solid #000', backgroundColor: '#000', color: '#FFFDFA', cursor: 'pointer', fontFamily: 'inherit', fontWeight: '500' },

  footer: { marginTop: '3rem', paddingTop: '2rem' },
  footerLine: { width: '80px', height: '2px', backgroundColor: '#E5E5E5', marginBottom: '1rem' },
  footerText: { fontSize: '0.8125rem', color: '#999', margin: 0 },
};
