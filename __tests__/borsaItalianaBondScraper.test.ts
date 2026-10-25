import { describe, it, expect, vi, afterEach } from 'vitest';
import { getBondPriceByIsin, validateBondIsin } from '@/lib/services/borsaItalianaBondScraperService';

describe('borsaItalianaBondScraperService', () => {
  describe('validateBondIsin', () => {
    it('should validate correct ISIN format', () => {
      expect(validateBondIsin('IT0005672024')).toBe(true);
      expect(validateBondIsin('IT0003128367')).toBe(true);
      expect(validateBondIsin('IT0001234567')).toBe(true);
    });

    it('should reject invalid ISIN format', () => {
      expect(validateBondIsin('INVALID')).toBe(false);
      expect(validateBondIsin('IT123')).toBe(false);
      expect(validateBondIsin('12345678901')).toBe(false);
    });

    it('should reject lowercase ISIN', () => {
      expect(validateBondIsin('it0005672024')).toBe(false);
    });

    it('should accept a foreign ISIN quoted on EuroMOT (Austria 0,85% 2120)', () => {
      expect(validateBondIsin('AT0000A2HLC4')).toBe(true);
      expect(validateBondIsin('DE0005140008')).toBe(true);
      expect(validateBondIsin('FR0000120271')).toBe(true);
    });

    it('should reject empty or malformed ISIN', () => {
      expect(validateBondIsin('')).toBe(false);
      expect(validateBondIsin('IT')).toBe(false);
      expect(validateBondIsin('IT00056720241')).toBe(false); // Too long
    });

    it('should accept ISIN with correct check digit', () => {
      // Note: This test validates format only, not check digit algorithm
      // Check digit validation could be added in future enhancement
      expect(validateBondIsin('IT0005672024')).toBe(true);
    });
  });

  // Note: Scraping tests would require mocking fetch() or using integration tests
  // with recorded HTML fixtures. Keeping tests focused on pure functions for now.

  describe('getBondPriceByIsin', () => {
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('scrapes a foreign EuroMOT bond from the same MOT page (Austria 0,85% 2120)', async () => {
      // The «Prezzo ufficiale» row as Borsa Italiana served it on 2026-10-25 (the main price has no formatPrice class).
      const html = '<html><body><strong>31,90</strong><table><tr><td>Prezzo ufficiale</td><td>31,59067</td></tr></table></body></html>';
      const fetchMock = vi.fn().mockResolvedValue(new Response(html, { status: 200 }));
      vi.stubGlobal('fetch', fetchMock);
      vi.spyOn(console, 'log').mockImplementation(() => {});

      const result = await getBondPriceByIsin('AT0000A2HLC4');

      expect(fetchMock).toHaveBeenCalledWith(
        'https://www.borsaitaliana.it/borsa/obbligazioni/mot/btp/scheda/AT0000A2HLC4-MOTX.html?lang=it',
        expect.anything()
      );
      expect(result.price).toBeCloseTo(31.59067, 5);
      expect(result.priceType).toBe('ufficiale');
    });
  });
});
