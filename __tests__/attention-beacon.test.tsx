/**
 * Story 3.4: Attention Beacon System - Unit Tests
 * Tests for AttentionBeacon component
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import AttentionBeacon from '../src/components/floor-plan/modern/AttentionBeacon';

// Mock utils
vi.mock('@/lib/utils', () => ({
  cn: (...classes: any[]) => classes.filter(Boolean).join(' '),
}));

describe('AttentionBeacon - Story 3.4 Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('AC1 - AttentionBeacon Component', () => {
    it('renders when active=true', () => {
      render(<AttentionBeacon active={true} severity="normal" />);
      
      const beacon = screen.getByTestId('attention-beacon');
      expect(beacon).toBeDefined();
    });

    it('returns null when active=false', () => {
      const { container } = render(<AttentionBeacon active={false} severity="normal" />);
      
      expect(container.firstChild).toBeNull();
    });

    it('has vo-beacon base class', () => {
      render(<AttentionBeacon active={true} severity="normal" />);
      
      const beacon = screen.getByTestId('attention-beacon');
      expect(beacon.className).toContain('vo-beacon');
    });

    it('accepts severity prop: normal', () => {
      render(<AttentionBeacon active={true} severity="normal" />);
      
      const beacon = screen.getByTestId('attention-beacon');
      expect(beacon.getAttribute('data-severity')).toBe('normal');
    });

    it('accepts severity prop: critical', () => {
      render(<AttentionBeacon active={true} severity="critical" />);
      
      const beacon = screen.getByTestId('attention-beacon');
      expect(beacon.getAttribute('data-severity')).toBe('critical');
    });

    it('applies custom className', () => {
      render(<AttentionBeacon active={true} severity="normal" className="custom-class" />);
      
      const beacon = screen.getByTestId('attention-beacon');
      expect(beacon.className).toContain('custom-class');
    });
  });

  describe('AC4 - Visual Severity Levels', () => {
    it('normal severity uses vo-beacon class (2s pulse animation)', () => {
      render(<AttentionBeacon active={true} severity="normal" />);
      
      const beacon = screen.getByTestId('attention-beacon');
      expect(beacon.className).toContain('vo-beacon');
      expect(beacon.className).not.toContain('vo-beacon-critical');
    });

    it('critical severity applies vo-beacon-critical class (1s fast pulse)', () => {
      render(<AttentionBeacon active={true} severity="critical" />);
      
      const beacon = screen.getByTestId('attention-beacon');
      expect(beacon.className).toContain('vo-beacon-critical');
    });
  });

  describe('AC6 - Theme-Aware Styling', () => {
    it('uses CSS class for theme token inheritance', () => {
      render(<AttentionBeacon active={true} severity="normal" />);
      
      const beacon = screen.getByTestId('attention-beacon');
      // vo-beacon class references --vo-beacon-color CSS variable
      expect(beacon.className).toContain('vo-beacon');
    });

    it('critical beacon uses dedicated CSS class for fixed red color', () => {
      render(<AttentionBeacon active={true} severity="critical" />);
      
      const beacon = screen.getByTestId('attention-beacon');
      // vo-beacon-critical class uses --vo-beacon-critical (#ff4d4d)
      expect(beacon.className).toContain('vo-beacon-critical');
    });
  });

  describe('AC7 - Accessibility', () => {
    it('has aria-live="polite" for status changes', () => {
      render(<AttentionBeacon active={true} severity="normal" />);
      
      const beacon = screen.getByTestId('attention-beacon');
      expect(beacon.getAttribute('aria-live')).toBe('polite');
    });

    it('renders as an output element for status changes', () => {
      render(<AttentionBeacon active={true} severity="normal" />);
      
      const beacon = screen.getByTestId('attention-beacon');
      expect(beacon.tagName).toBe('OUTPUT');
    });

    it('has aria-label with reason', () => {
      render(<AttentionBeacon active={true} severity="normal" reason="High occupancy" />);
      
      const beacon = screen.getByTestId('attention-beacon');
      expect(beacon.getAttribute('aria-label')).toBe('Attention needed: High occupancy');
    });

    it('has visually hidden screen reader text with reason', () => {
      render(<AttentionBeacon active={true} severity="critical" reason="Blocker logged" />);
      
      const beacon = screen.getByTestId('attention-beacon');
      const srText = beacon.querySelector('.sr-only');
      
      expect(srText).not.toBeNull();
      expect(srText?.textContent).toContain('Attention needed: Blocker logged');
    });

    it('uses default reason when not provided', () => {
      render(<AttentionBeacon active={true} severity="normal" />);
      
      const beacon = screen.getByTestId('attention-beacon');
      expect(beacon.getAttribute('aria-label')).toBe('Attention needed: Attention needed');
    });
  });

  describe('Conditional Rendering', () => {
    it('does not render any DOM element when inactive', () => {
      const { container } = render(
        <AttentionBeacon active={false} severity="critical" reason="Should not show" />
      );
      
      expect(container.innerHTML).toBe('');
    });

    it('renders DOM element when active', () => {
      const { container } = render(
        <AttentionBeacon active={true} severity="normal" />
      );
      
      expect(container.innerHTML).not.toBe('');
    });
  });
});
