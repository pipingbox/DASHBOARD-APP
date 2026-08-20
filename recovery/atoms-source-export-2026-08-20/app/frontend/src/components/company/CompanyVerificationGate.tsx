import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/hooks/useAuth';
import { supabase, TABLES } from '@/lib/supabase';
import { ShieldAlert, Clock, CheckCircle2, FileText, Building2, Loader2 } from 'lucide-react';

type CompanyStatus = 'pending' | 'verified' | 'rejected' | 'suspended' | null;

interface CompanyVerificationState {
  company_verified: boolean;
  company_status: CompanyStatus;
  loading: boolean;
}

interface CompanyVerificationGateProps {
  children: React.ReactNode;
  /** If true, admins bypass the gate */
  allowAdmin?: boolean;
}

export function CompanyVerificationGate({ children, allowAdmin = true }: CompanyVerificationGateProps) {
  const { user, profile } = useAuth();
  const { t } = useTranslation();
  const [state, setState] = useState<CompanyVerificationState>({
    company_verified: false,
    company_status: null,
    loading: true,
  });

  useEffect(() => {
    const checkVerification = async () => {
      if (!user) {
        setState({ company_verified: false, company_status: null, loading: false });
        return;
      }

      // Admin bypass
      if (allowAdmin && profile?.role === 'admin') {
        setState({ company_verified: true, company_status: 'verified', loading: false });
        return;
      }

      try {
        const { data, error } = await supabase
          .from(TABLES.profiles)
          .select('company_verified, company_status')
          .eq('user_id', user.id)
          .single();

        if (error) {
          console.error('[CompanyVerificationGate] Error:', error);
          // If columns don't exist yet, treat as pending
          setState({ company_verified: false, company_status: 'pending', loading: false });
          return;
        }

        setState({
          company_verified: data?.company_verified === true,
          company_status: data?.company_status || 'pending',
          loading: false,
        });
      } catch (err) {
        console.error('[CompanyVerificationGate] Unexpected error:', err);
        setState({ company_verified: false, company_status: 'pending', loading: false });
      }
    };

    checkVerification();
  }, [user, profile, allowAdmin]);

  if (state.loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 text-[#f59e0b] animate-spin" />
      </div>
    );
  }

  // Verified — render children
  if (state.company_verified) {
    return <>{children}</>;
  }

  // Not verified — show appropriate message based on status
  return (
    <div className="space-y-6">
      <div className="border border-zinc-800/80 bg-[#0d0d0d] rounded-sm p-8 max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex flex-col items-center text-center space-y-4">
          {state.company_status === 'rejected' ? (
            <div className="h-16 w-16 rounded-full bg-red-950/50 border border-red-800/30 flex items-center justify-center">
              <ShieldAlert className="h-8 w-8 text-red-400" />
            </div>
          ) : state.company_status === 'suspended' ? (
            <div className="h-16 w-16 rounded-full bg-orange-950/50 border border-orange-800/30 flex items-center justify-center">
              <ShieldAlert className="h-8 w-8 text-orange-400" />
            </div>
          ) : (
            <div className="h-16 w-16 rounded-full bg-amber-950/50 border border-amber-800/30 flex items-center justify-center">
              <Clock className="h-8 w-8 text-amber-400" />
            </div>
          )}

          <div className="space-y-2">
            <h2 className="text-xl font-bold text-zinc-100">
              {state.company_status === 'rejected'
                ? t('companyVerification.rejectedTitle', 'Verification Rejected')
                : state.company_status === 'suspended'
                ? t('companyVerification.suspendedTitle', 'Account Suspended')
                : t('companyVerification.pendingTitle', 'Verification Pending')}
            </h2>
            <p className="text-sm text-zinc-400 max-w-md">
              {state.company_status === 'rejected'
                ? t('companyVerification.rejectedDesc', 'Your company verification was rejected. Please contact support or update your company information and resubmit.')
                : state.company_status === 'suspended'
                ? t('companyVerification.suspendedDesc', 'Your company account has been suspended. Please contact the administrator for more information.')
                : t('companyVerification.pendingDesc', 'Your company account is pending verification. Once verified by an administrator, you will have full access to the worker search and recruitment tools.')}
            </p>
          </div>
        </div>

        {/* Status indicator */}
        <div className="mt-8 border border-zinc-800/60 rounded-sm p-4 bg-zinc-950/50">
          <div className="flex items-center gap-3">
            <div className={`h-3 w-3 rounded-full ${
              state.company_status === 'verified' ? 'bg-emerald-400' :
              state.company_status === 'rejected' ? 'bg-red-400' :
              state.company_status === 'suspended' ? 'bg-orange-400' :
              'bg-amber-400 animate-pulse'
            }`} />
            <div>
              <p className="text-xs font-medium text-zinc-300">
                {t('companyVerification.statusLabel', 'Verification Status')}
              </p>
              <p className="text-[11px] text-zinc-500">
                {state.company_status === 'pending'
                  ? t('companyVerification.statusPending', 'Under review — typically 1-2 business days')
                  : state.company_status === 'rejected'
                  ? t('companyVerification.statusRejected', 'Rejected — please update your profile and contact support')
                  : state.company_status === 'suspended'
                  ? t('companyVerification.statusSuspended', 'Suspended — contact administrator')
                  : t('companyVerification.statusUnknown', 'Unknown status')}
              </p>
            </div>
          </div>
        </div>

        {/* Steps to complete */}
        {state.company_status === 'pending' && (
          <div className="mt-6 space-y-3">
            <p className="text-xs font-medium text-zinc-400 uppercase tracking-wider">
              {t('companyVerification.whileWaiting', 'While you wait, make sure you have:')}
            </p>
            <div className="space-y-2">
              <VerificationStep
                icon={Building2}
                label={t('companyVerification.stepCompanyName', 'Company name filled in your profile')}
              />
              <VerificationStep
                icon={FileText}
                label={t('companyVerification.stepIndustry', 'Industry and country specified')}
              />
              <VerificationStep
                icon={CheckCircle2}
                label={t('companyVerification.stepDescription', 'Company description provided')}
              />
            </div>
          </div>
        )}

        {/* Action buttons */}
        <div className="mt-6 flex flex-col sm:flex-row items-center gap-3">
          {(state.company_status === 'pending' || state.company_status === 'rejected') && (
            <a
              href="/company/profile"
              className="w-full sm:w-auto flex items-center justify-center gap-2 rounded-sm bg-[#f59e0b] px-5 py-2.5 text-xs font-semibold text-black hover:bg-[#d97706] transition"
            >
              <Building2 className="h-3.5 w-3.5" />
              {t('companyVerification.updateProfile', 'Update Company Profile')}
            </a>
          )}
          <a
            href="mailto:support@pipingbox.com"
            className="w-full sm:w-auto flex items-center justify-center gap-2 rounded-sm border border-zinc-700 bg-zinc-900 px-5 py-2.5 text-xs text-zinc-300 hover:bg-zinc-800 transition"
          >
            {t('companyVerification.contactSupport', 'Contact Support')}
          </a>
        </div>
      </div>
    </div>
  );
}

function VerificationStep({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
  return (
    <div className="flex items-center gap-2.5 text-sm text-zinc-400">
      <div className="h-6 w-6 rounded-sm bg-zinc-800/80 flex items-center justify-center shrink-0">
        <Icon className="h-3.5 w-3.5 text-zinc-500" />
      </div>
      <span className="text-xs">{label}</span>
    </div>
  );
}

export default CompanyVerificationGate;