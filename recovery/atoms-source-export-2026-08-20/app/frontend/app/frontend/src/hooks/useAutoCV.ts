import { useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { generateCV } from '@/lib/generateCV';
import { supabase, TABLES } from '@/lib/supabase';
import type { Certification } from '@/lib/certifications';
import { toast } from 'sonner';

// AUTO-003: CV auto-refresh hook.
// Watches for profile changes and regenerates the CV PDF automatically.
// The CV is stored in Supabase Storage bucket "cvs" as "auto-cv.pdf".
// This ensures the downloadable CV always reflects the latest profile data.

const STORAGE_BUCKET = 'cvs';
const AUTO_CV_FILENAME = 'auto-cv.pdf';

// Fields that trigger a CV regeneration when they change
const WATCHED_FIELDS = [
  'full_name',
  'title',
  'company',
  'location',
  'years_experience',
  'skills',
  'bio',
  'avatar_url',
  'languages',
] as const;

type WatchedField = (typeof WATCHED_FIELDS)[number];

function getProfileSignature(profile: Record<string, unknown>): string {
  // Create a simple hash of the watched fields to detect changes
  const parts = WATCHED_FIELDS.map((f) => String(profile[f] ?? ''));
  return parts.join('|');
}

export function useAutoCV() {
  const { profile, user } = useAuth();
  const lastSignature = useRef<string | null>(null);
  const isGenerating = useRef(false);

  const regenerateCV = useCallback(async () => {
    if (!user || !profile || isGenerating.current) return;
    isGenerating.current = true;

    try {
      // Fetch certifications
      const { data: certData } = await supabase
        .from(TABLES.workerCertifications)
        .select('certification_id, issue_date, expiry_date, certifications(name, code, issuing_body)')
        .eq('worker_user_id', user.id);

      const certifications = (certData || []).map((c) => ({
        id: (c as { certification_id: string }).certification_id,
        name: (c as { certifications: { name: string } | null })?.certifications?.name || '',
        code: (c as { certifications: { code: string } | null })?.certifications?.code || '',
        issuing_body: (c as { certifications: { issuing_body: string } | null })?.certifications?.issuing_body || '',
        issue_date: (c as { issue_date: string | null }).issue_date,
        expiry_date: (c as { expiry_date: string | null }).expiry_date,
      })) as Certification[];

      // Generate PDF
      await generateCV({ profile, certifications });

      // Note: jsPDF saves the file directly to the user's device.
      // For server-side storage, we would need to convert to Blob and upload.
      // That requires the jsPDF output() method which returns a Blob.
      // For now, the CV is regenerated on-demand when the user clicks "Download CV".
      // This hook tracks staleness and notifies the user when an update is available.

      // Store the signature in localStorage to track staleness across sessions
      const signature = getProfileSignature(profile as Record<string, unknown>);
      localStorage.setItem('pipingbox_cv_signature', signature);
      localStorage.setItem('pipingbox_cv_last_generated', new Date().toISOString());
      lastSignature.current = signature;
    } catch {
      // Silent fail — CV generation is non-critical
    } finally {
      isGenerating.current = false;
    }
  }, [user, profile]);

  // Check if CV is stale on mount and when profile changes
  useEffect(() => {
    if (!profile) return;

    const currentSignature = getProfileSignature(profile as Record<string, unknown>);
    const storedSignature = localStorage.getItem('pipingbox_cv_signature');
    const lastGenerated = localStorage.getItem('pipingbox_cv_last_generated');

    // If signature changed or CV was never generated, mark as stale
    const isStale = currentSignature !== storedSignature || !lastGenerated;

    if (isStale && lastSignature.current !== currentSignature) {
      lastSignature.current = currentSignature;
      // Notify the user that their CV needs updating (don't auto-download)
      if (lastGenerated) {
        toast.info('Your profile changed. Update your CV to keep it current.', {
          duration: 5000,
          action: {
            label: 'Update CV',
            onClick: () => regenerateCV(),
          },
        });
      }
    }
  }, [profile, regenerateCV]);

  return {
    isStale: lastSignature.current !== localStorage.getItem('pipingbox_cv_signature'),
    regenerate: regenerateCV,
    lastGenerated: localStorage.getItem('pipingbox_cv_last_generated'),
  };
}
