import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';

function RegisterPage() {
  const [form, setForm] = useState({
    name: '',
    email: '',
    walletAddress: '',     // keep if you want manual entry; optional if using Connect Wallet flow
    password: '',
    confirmPassword: '',
  });
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage('');

    if (form.password !== form.confirmPassword) {
      setMessage('❌ Passwords do not match');
      return;
    }
    // If you keep the wallet input, validate it as a 42-char EVM address
    if (form.walletAddress && !/^0x[a-fA-F0-9]{40}$/.test(form.walletAddress)) {
      setMessage('❌ Wallet address must be 0x followed by 40 hex characters (42 total)');
      return;
    }

    try {
      setSubmitting(true);

      //  Register with name+email+password only
      const res = await fetch('http://localhost:5000/property/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          email: form.email,
          password: form.password,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setMessage(`❌ ${data.error || 'Registration failed'}`);
        return;
      }

      // Save token/email if returned
      if (data.token) localStorage.setItem('token', data.token);
      if (data.user?.email) localStorage.setItem('email', data.user.email);

      // Save wallet to profile if provided
      if (form.walletAddress && data.token) {
        await fetch('http://localhost:5000/user/wallet', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.token}` },
          body: JSON.stringify({ address: form.walletAddress }),
        });
      }

      setMessage('✅ Registration successful! Redirecting to login...');
      setTimeout(() => navigate('/login'), 1200);
    } catch {
      setMessage('❌ Network error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={styles.container}>
      <h2 style={{ marginBottom: 20 }}>Register</h2>
      <form onSubmit={handleSubmit} style={styles.form}>
        <input name="name" placeholder="Full Name" onChange={handleChange} required style={styles.input} />
        <input name="email" type="email" placeholder="Email" onChange={handleChange} required style={styles.input} />

        {/* Optional manual wallet entry — you can remove this if using Connect Wallet after login */}
        <input
          name="walletAddress"
          placeholder="Wallet Address (0x + 40 hex)"
          onChange={handleChange}
          style={styles.input}
          inputMode="text"
          pattern="^0x[a-fA-F0-9]{40}$"
          title="Must be 42 characters: 0x followed by 40 hex characters"
        />

        <input name="password" type="password" placeholder="Password" onChange={handleChange} required style={styles.input} />
        <input name="confirmPassword" type="password" placeholder="Confirm Password" onChange={handleChange} required style={styles.input} />
        <button type="submit" disabled={submitting} style={{ ...styles.button, opacity: submitting ? .7 : 1 }}>
          {submitting ? 'Registering...' : 'Register'}
        </button>
      </form>
      <p style={{ marginTop: 20 }}>
        Already have an account? <Link to="/login" style={styles.link}>Login</Link>
      </p>
      {message && (
        <p style={{ marginTop: 10, color: message.includes('✅') ? 'green' : 'red', fontWeight: 'bold' }}>
          {message}
        </p>
      )}
    </div>
  );
}

const styles = {
  container: { height: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center', flexDirection: 'column', padding: 20 },
  form: { display: 'flex', flexDirection: 'column', width: 300, gap: 15 },
  input: { padding: 10, fontSize: 16 },
  button: { padding: 10, fontSize: 16, color: '#fff', border: 'none', background: '#111827', borderRadius: 8, cursor: 'pointer' },
  link: { color: '#2563eb', textDecoration: 'none' },
};

export default RegisterPage;
