import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Users,
  Copy,
  Check,
  Share2,
  MessageCircle,
  Shield,
  Star,
  Crown,
  Lock,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import {
  shouldShowReferralWidget,
  getUserReferralCode,
  getReferralStats,
  getReferralLink,
  getWhatsAppShareUrl,
  copyReferralLink,
  copyReferralCode,
  shareReferralLink,
  REWARD_TIERS,
  type ReferralStats,
} from '@/lib/referrals';
import { toast } from 'sonner';

export function ProNetworkWidget() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(true);
  const [referralCode, setReferralCode] = useState('');
  const [stats, setStats] = useState<ReferralStats>({
    totalReferrals: 0,
    verifiedReferrals: 0,
    currentLevel: 0,
    nextLevelTarget: 3,
    unlockedRewards: [],
  });
  const [copied, setCopied] = useState(false);

  const loadData = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const show = await shouldShowReferralWidget(user.id);
      setVisible(show);
      if (show) {
        const [code, referralStats] = await Promise.all([
          getUserReferralCode(user.id),
          getReferralStats(user.id),
        ]);
        setReferralCode(code);
        setStats(referralStats);
      }
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleCopyLink = async () => {
    if (!referralCode) return;
    const success = await copyReferralLink(referralCode);
    if (success) {
      setCopied(true);
      toast.success(t('proNetwork.linkCopied'));
      setTimeout(() => setCopied(false), 2000);
    } else {
      toast.error(t('proNetwork.copyFailed'));
    }
  };

  const handleCopyCode = async () => {
    if (!referralCode) return;
    const success = await copyReferralCode(referralCode);
    if (success) {
      setCopied(true);
      toast.success(t('proNetwork.codeCopied'));
      setTimeout(() => setCopied(false), 2000);
    } else {
      toast.error(t('proNetwork.copyFailed'));
    }
  };

  const handleWhatsApp = () => {
    if (!referralCode) return;
    const msg = t('proNetwork.shareMessage');
    const url = getWhatsAppShareUrl(referralCode, msg);
    window.open(url, '_blank');
  };

  const handleNativeShare = async () => {
    if (!referralCode) return;
    const success = await shareReferralLink(
      referralCode,
      t('proNetwork.shareTitle'),
      t('proNetwork.shareMessage'),
    );
    if (success) {
      toast.success(t('proNetwork.shared'));
    }
  };

  if (loading || !visible) return null;

  const currentTarget = stats.nextLevelTarget;
  const progressPercent = Math.min(
    (stats.verifiedReferrals / currentTarget) * 100,
    100,
  );

  const getLevelIcon = (level: number) => {
    switch (level) {
      case 1:
        return <Shield className="h-4 w-4" />;
      case 2:
        return <Star className="h-4 w-4" />;
      case 3:
        return <Crown className="h-4 w-4" />;
      default:
        return <Users className="h-4 w-4" />;
    }
  };

  const getRewardLabel = (reward: string): string => {
    return t(`proNetwork.rewards.${reward}`);
  };

  return (
    <div className="border border-zinc-800/80 bg-[#0d0d0d] p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-[10px] uppercase tracking-[0.25em] text-[#f59e0b]">
            {t('proNetwork.eyebrow')}
          </p>
          <h3 className="mt-1 text-lg font-semibold text-zinc-100">
            {t('proNetwork.title')}
          </h3>
        </div>
        <div className="flex h-10 w-10 items-center justify-center bg-zinc-900 text-[#f59e0b]">
          {getLevelIcon(stats.currentLevel)}
        </div>
      </div>

      {/* Progress section */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-zinc-400">
            {t('proNetwork.progress', {
              current: stats.verifiedReferrals,
              target: currentTarget,
            })}
          </span>
          {stats.currentLevel > 0 && (
            <Badge
              variant="outline"
              className="border-[#f59e0b]/30 text-[#f59e0b] text-[10px]"
            >
              {t('proNetwork.level', { level: stats.currentLevel })}
            </Badge>
          )}
        </div>
        <Progress value={progressPercent} className="h-2 bg-zinc-800" />
        <p className="mt-2 text-xs text-zinc-500">
          {stats.verifiedReferrals < REWARD_TIERS[0].target
            ? t('proNetwork.inviteMessage', {
                count: REWARD_TIERS[0].target - stats.verifiedReferrals,
              })
            : stats.currentLevel < 3
              ? t('proNetwork.nextLevelMessage', {
                  count: currentTarget - stats.verifiedReferrals,
                })
              : t('proNetwork.maxLevel')}
        </p>
      </div>

      {/* Reward tiers */}
      <div className="mb-4 space-y-2">
        {REWARD_TIERS.map((tier) => {
          const unlocked = stats.verifiedReferrals >= tier.target;
          return (
            <div
              key={tier.level}
              className={`flex items-center gap-3 p-2 border ${
                unlocked
                  ? 'border-[#f59e0b]/30 bg-[#f59e0b]/5'
                  : 'border-zinc-800/50 bg-zinc-900/30'
              }`}
            >
              <div
                className={`flex h-7 w-7 items-center justify-center ${
                  unlocked ? 'text-[#f59e0b]' : 'text-zinc-600'
                }`}
              >
                {unlocked ? getLevelIcon(tier.level) : <Lock className="h-3.5 w-3.5" />}
              </div>
              <div className="flex-1 min-w-0">
                <p
                  className={`text-xs font-medium ${
                    unlocked ? 'text-zinc-100' : 'text-zinc-500'
                  }`}
                >
                  {t(`proNetwork.tierTitle.${tier.level}`)}
                </p>
                <p className="text-[10px] text-zinc-600">
                  {t('proNetwork.tierTarget', { count: tier.target })}
                </p>
              </div>
              {unlocked && (
                <Badge
                  variant="outline"
                  className="border-[#f59e0b]/40 text-[#f59e0b] text-[9px]"
                >
                  {t('proNetwork.unlocked')}
                </Badge>
              )}
            </div>
          );
        })}
      </div>

      {/* Unlocked rewards */}
      {stats.unlockedRewards.length > 0 && (
        <div className="mb-4">
          <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 mb-2">
            {t('proNetwork.yourAccess')}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {stats.unlockedRewards.map((reward) => (
              <Badge
                key={reward}
                variant="secondary"
                className="bg-zinc-800 text-zinc-300 text-[10px]"
              >
                {getRewardLabel(reward)}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Referral code */}
      <div className="mb-4 p-3 bg-zinc-900/50 border border-zinc-800/60">
        <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 mb-1.5">
          {t('proNetwork.yourCode')}
        </p>
        <div className="flex items-center gap-2">
          <code className="flex-1 text-sm font-mono text-[#f59e0b] tracking-wider">
            {referralCode}
          </code>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleCopyCode}
            className="h-7 w-7 p-0 text-zinc-400 hover:text-[#f59e0b]"
          >
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          </Button>
        </div>
        {/* Show full referral URL for clarity */}
        <p className="mt-2 text-[10px] text-zinc-600 font-mono truncate">
          {getReferralLink(referralCode)}
        </p>
      </div>

      {/* Share actions */}
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={handleCopyLink}
          className="!bg-transparent border-zinc-800 text-zinc-300 hover:text-[#f59e0b] hover:border-[#f59e0b] text-xs"
        >
          <Copy className="mr-1.5 h-3.5 w-3.5" />
          {t('proNetwork.copyLink')}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={handleWhatsApp}
          className="!bg-transparent border-zinc-800 text-zinc-300 hover:text-green-400 hover:border-green-400 text-xs"
        >
          <MessageCircle className="mr-1.5 h-3.5 w-3.5" />
          WhatsApp
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={handleNativeShare}
          className="!bg-transparent border-zinc-800 text-zinc-300 hover:text-zinc-100 hover:border-zinc-600 text-xs"
        >
          <Share2 className="mr-1.5 h-3.5 w-3.5" />
          {t('proNetwork.share')}
        </Button>
      </div>
    </div>
  );
}