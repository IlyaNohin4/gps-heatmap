import React, { useState } from 'react';
import { Search } from 'lucide-react';
import '../styles/tokens.css';
import '../styles/ui.css';
import Button from '../ui/Button.jsx';
import Input from '../ui/Input.jsx';
import Card from '../ui/Card.jsx';
import Panel from '../ui/Panel.jsx';
import Chip from '../ui/Chip.jsx';
import Modal from '../ui/Modal.jsx';

const section = { marginBottom: 40 };
const heading = { fontSize: 18, fontWeight: 700, marginBottom: 12, color: 'var(--text)' };
const row = { display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 };

export default function UiDemoPage() {
  const [modalOpen, setModalOpen] = useState(false);
  const [activeChip, setActiveChip] = useState('a');

  return (
    <div style={{ padding: 32, maxWidth: 800, margin: '0 auto', background: 'var(--bg)', minHeight: '100vh' }}>
      <h1 style={{ fontSize: 24, marginBottom: 24, color: 'var(--text)' }}>UI Kit Demo</h1>

      <div style={section}>
        <div style={heading}>Spacing scale</div>
        <div style={row}>
          {['--space-1', '--space-2', '--space-3', '--space-4', '--space-5'].map((v) => (
            <div key={v} style={{ textAlign: 'center' }}>
              <div style={{ width: `var(${v})`, height: `var(${v})`, background: 'var(--accent)' }} />
              <div style={{ fontSize: 11, marginTop: 4, color: 'var(--text-secondary)' }}>{v}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={section}>
        <div style={heading}>Button</div>
        <div style={row}>
          <Button variant="primary">Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger">Danger</Button>
          <Button variant="primary" disabled>Disabled</Button>
        </div>
        <div style={row}>
          <Button variant="primary" size="sm">Primary sm</Button>
          <Button variant="secondary" size="sm">Secondary sm</Button>
          <Button variant="primary" iconOnly title="Search"><Search size={14} /></Button>
          <Button variant="ghost" iconOnly title="Search"><Search size={14} /></Button>
          <Button variant="secondary" iconOnly size="sm" title="Search"><Search size={12} /></Button>
        </div>
        <div style={row}>
          <Button variant="ghost" iconOnly active title="Filters (active)"><Search size={14} /></Button>
          <Button variant="ghost" iconOnly title="Filters (inactive)"><Search size={14} /></Button>
        </div>
      </div>

      <div style={section}>
        <div style={heading}>Input</div>
        <div style={{ ...row, maxWidth: 320 }}>
          <Input placeholder="Plain input" />
        </div>
        <div style={{ ...row, maxWidth: 320 }}>
          <Input placeholder="With icon" leftIcon={<Search size={14} />} />
        </div>
        <div style={{ ...row, maxWidth: 320 }}>
          <Input placeholder="Disabled" disabled />
        </div>
      </div>

      <div style={section}>
        <div style={heading}>Card</div>
        <div style={{ ...row, maxWidth: 320, flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
          <Card>Card content one</Card>
          <Card>Card content two</Card>
        </div>
      </div>

      <div style={section}>
        <div style={heading}>Panel (island)</div>
        <Panel style={{ maxWidth: 320 }}>Panel content, styled like an app island.</Panel>
      </div>

      <div style={section}>
        <div style={heading}>Chip</div>
        <div style={row}>
          <Chip active={activeChip === 'a'} onClick={() => setActiveChip('a')}>All</Chip>
          <Chip active={activeChip === 'b'} onClick={() => setActiveChip('b')}>Recent</Chip>
          <Chip active={activeChip === 'c'} onClick={() => setActiveChip('c')}>Favorites</Chip>
        </div>
      </div>

      <div style={section}>
        <div style={heading}>Modal</div>
        <Button variant="primary" onClick={() => setModalOpen(true)}>Open modal</Button>
        <Modal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          title="Example modal"
          actions={(
            <>
              <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
              <Button variant="primary" onClick={() => setModalOpen(false)}>Confirm</Button>
            </>
          )}
        >
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            Escape or click outside closes this modal.
          </p>
        </Modal>
      </div>
    </div>
  );
}
