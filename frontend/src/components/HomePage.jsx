import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PropertyCard from './PropertyCard';

const API = 'http://localhost:5000';

function HomePage() {
  const [properties, setProperties] = useState([]);
  const [err, setErr] = useState('');
  const [loadingUser, setLoadingUser] = useState(true);
  const [loadingProps, setLoadingProps] = useState(true);
  const navigate = useNavigate();

  // Auth check
  useEffect(() => {
    const checkAuth = async () => {
      const token = localStorage.getItem('token');
      if (!token) { navigate('/login'); return; }
      try {
        const res = await fetch(`${API}/property/protected`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setErr(data.error || 'Unauthorized');
          localStorage.removeItem('token');
          navigate('/login');
          return;
        }
      } catch {
        setErr('Something went wrong. Please try again.');
        navigate('/login');
      } finally {
        setLoadingUser(false);
      }
    };
    checkAuth();
  }, [navigate]);

  // Load properties from DB
  useEffect(() => {
    const fetchProps = async () => {
      try {
        const res = await fetch(`${API}/property/list?page=1&limit=24`);
        if (!res.ok) throw new Error('Failed to load properties');
        const { items } = await res.json();

        // Normalize to a single `imageUrl` field using value from DB only
        const normalized = (Array.isArray(items) ? items : []).map((p) => {
          const fromDB =
            (p.imageUrl ?? p.imageURL ?? '') // accept either DB key
              .toString()
              .trim()
              .replace(/[.,]+$/, ''); // strip accidental trailing punctuation
          return { ...p, imageUrl: fromDB };
        });

        setProperties(normalized);
      } catch (e) {
        setErr(e.message || 'Failed to load properties');
      } finally {
        setLoadingProps(false);
      }
    };
    fetchProps();
  }, []);

  if (loadingUser || loadingProps) {
    return (
      <div style={{ padding: 24, textAlign: 'center', fontWeight: 600 }}>
        Loading...
      </div>
    );
  }

  return (
    <div style={{ padding: 24 }}>
      {err && (
        <div
          style={{
            background: '#fee2e2',
            color: '#991b1b',
            padding: '10px 12px',
            borderRadius: 8,
            marginBottom: 16,
            border: '1px solid #fecaca',
          }}
        >
          {err}
        </div>
      )}

      {properties.length === 0 ? (
        <div style={{ color: '#64748b' }}>No properties yet.</div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
            gap: 16,
          }}
        >
          {properties.map((p) => (
            <PropertyCard
              key={p._id}
              property={p} // contains imageUrl from DB
              currentWallet={localStorage.getItem('wallet') || ''}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default HomePage;
