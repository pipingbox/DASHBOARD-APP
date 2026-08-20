import { useState, useEffect } from 'react';
import { GraduationCap, Clock, BookOpen, Shield, ChevronRight, Award, Download, FileText } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { getModuleCount } from '@/lib/vca-questions';
import { supabase, TABLES } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { downloadCertificate } from '@/lib/certificate-generator';
import { toast } from 'sonner';

type Level = 'Beginner' | 'Intermediate' | 'Advanced';

const TRACK_KEYS = [
  { key: 'piping_fundamentals', level: 'Beginner' as Level, lessons: 24, hours: '8h' },
  { key: 'stress_analysis', level: 'Intermediate' as Level, lessons: 38, hours: '16h' },
  { key: 'process_piping', level: 'Advanced' as Level, lessons: 42, hours: '20h' },
  { key: 'isometric_drawings', level: 'Beginner' as Level, lessons: 18, hours: '6h' },
  { key: 'material_selection', level: 'Intermediate' as Level, lessons: 20, hours: '7h' },
  { key: 'pipe_support', level: 'Intermediate' as Level, lessons: 26, hours: '10h' },
];

const LEVEL_STYLES: Record<Level, string> = {
  Beginner: 'text-emerald-400 border-emerald-400/40',
  Intermediate: 'text-[#f59e0b] border-[#f59e0b]/40',
  Advanced: 'text-rose-400 border-rose-400/40',
};

const LEVEL_KEYS: Record<Level, string> = {
  Beginner: 'academy.levelBeginner',
  Intermediate: 'academy.levelIntermediate',
  Advanced: 'academy.levelAdvanced',
};

const VCA_MODULES = [
  { id: 1, name: 'Legislation' },
  { id: 2, name: 'Dangers, Risks and Prevention' },
  { id: 3, name: 'Accidents: Causes and Prevention' },
  { id: 4, name: 'Safety Conduct' },
  { id: 5, name: 'Tasks, Rights, Duties and Discussions' },
  { id: 6, name: 'Procedures, Instructions and Signs' },
  { id: 7, name: 'Preparations for Emergencies' },
  { id: 8, name: 'Hazardous Substances' },
  { id: 9, name: 'Fire and Explosions' },
  { id: 10, name: 'Equipment' },
  { id: 11, name: 'Demolish Activities' },
  { id: 12, name: 'Welding, Cutting and Burning' },
  { id: 13, name: 'Digging and Excavations' },
  { id: 14, name: 'Working at Height' },
  { id: 15, name: 'Electricity' },
  { id: 16, name: 'Confined Spaces' },
  { id: 17, name: 'Hoisting' },
  { id: 18, name: 'Radiation' },
  { id: 19, name: 'The Ergonomic Workplace' },
  { id: 20, name: 'Noise at the Workplace' },
  { id: 21, name: 'Personal Protective Equipment' },
  { id: 22, name: 'Signs and Markings' },
];

type TabKey = 'courses' | 'vca' | 'certificates';

interface AcademyProgressRow {
  module_id: number;
  completed: boolean;
  score: number;
  best_score: number;
  attempts: number;
}

export default function Academy() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const moduleCounts = getModuleCount();
  const [activeTab, setActiveTab] = useState<TabKey>('courses');
  const [progress, setProgress] = useState<AcademyProgressRow[]>([]);
  const [loadingProgress, setLoadingProgress] = useState(false);

  useEffect(() => {
    if (user?.id && activeTab === 'certificates') {
      loadProgress();
    }
  }, [user?.id, activeTab]);

  const loadProgress = async () => {
    if (!user?.id) return;
    setLoadingProgress(true);
    try {
      const { data } = await supabase
        .from(TABLES.academyProgress)
        .select('module_id, completed, score, best_score, attempts')
        .eq('user_id', user.id);
      setProgress(data || []);
    } catch (e) {
      console.warn('Failed to load progress:', e);
    } finally {
      setLoadingProgress(false);
    }
  };

  const handleDownloadCertificate = () => {
    const completedModules = progress.filter(p => p.completed);
    if (completedModules.length < 22) {
      toast.error(
        t('academy.certIncomplete', 'Complete all 22 modules to earn your certificate')
      );
      return;
    }

    const avgScore = Math.round(
      completedModules.reduce((sum, p) => sum + Number(p.best_score), 0) / completedModules.length
    );

    const userName = profile?.full_name || profile?.first_name
      ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim()
      : user?.email || 'Student';

    downloadCertificate({
      userName,
      courseName: 'VCA Safety Certification - All 22 Modules',
      completedModules: completedModules.length,
      totalModules: 22,
      averageScore: avgScore,
      completedAt: new Date(),
      examType: 'full',
    });

    toast.success(t('academy.certDownloaded', 'Certificate downloaded!'));
  };

  const completedCount = progress.filter(p => p.completed).length;

  const tabs: { key: TabKey; label: string; icon: React.ReactNode }[] = [
    { key: 'courses', label: t('academy.tabCourses', 'Courses'), icon: <BookOpen className="h-4 w-4" /> },
    { key: 'vca', label: t('academy.tabVCA', 'VCA Certification'), icon: <Shield className="h-4 w-4" /> },
    { key: 'certificates', label: t('academy.tabCertificates', 'My Certificates'), icon: <Award className="h-4 w-4" /> },
  ];

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={t('academy.eyebrow')}
        title={t('academy.title')}
        description={t('academy.description')}
      />

      {/* Tab Navigation */}
      <div className="flex gap-1 border-b border-zinc-800/80">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.key
                ? 'border-[#f59e0b] text-[#f59e0b]'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab: Courses */}
      {activeTab === 'courses' && (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {TRACK_KEYS.map((track) => (
            <div
              key={track.key}
              className="group flex flex-col border border-zinc-800/80 bg-[#0d0d0d] p-6 hover:border-[#f59e0b] transition"
            >
              <div className="flex items-start justify-between">
                <GraduationCap className="h-6 w-6 text-[#f59e0b]" />
                <span
                  className={`px-2 py-0.5 text-[10px] uppercase tracking-[0.2em] border ${LEVEL_STYLES[track.level]}`}
                >
                  {t(LEVEL_KEYS[track.level])}
                </span>
              </div>
              <h3 className="mt-4 text-lg font-semibold">
                {t(`academy.courses.${track.key}.title`)}
              </h3>
              <p className="mt-1 text-sm text-zinc-400 flex-1">
                {t(`academy.courses.${track.key}.description`)}
              </p>
              <div className="mt-4 flex items-center gap-4 text-xs text-zinc-500">
                <span className="flex items-center gap-1">
                  <BookOpen className="h-3.5 w-3.5" />{' '}
                  {track.lessons} {t('academy.lessons')}
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" /> {track.hours}
                </span>
              </div>
              <Button
                variant="outline"
                className="mt-4 border-zinc-800 bg-transparent hover:bg-[#f59e0b] hover:text-black hover:border-[#f59e0b]"
              >
                {t('academy.startTrack')}
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Tab: VCA Certification */}
      {activeTab === 'vca' && (
        <div className="space-y-6">
          {/* Practice Exam Buttons */}
          <div className="flex flex-wrap gap-3">
            <Button
              onClick={() => navigate('/academy/exam/bvca')}
              className="bg-[#f59e0b] hover:bg-[#d97706] text-black font-medium"
            >
              <FileText className="h-4 w-4 mr-2" />
              {t('academy.startBVCAExam', 'Start B-VCA Practice Exam')}
            </Button>
            <Button
              onClick={() => navigate('/academy/exam/volvca')}
              variant="outline"
              className="border-[#f59e0b]/50 text-[#f59e0b] hover:bg-[#f59e0b]/10"
            >
              <FileText className="h-4 w-4 mr-2" />
              {t('academy.startVOLVCAExam', 'Start VOL-VCA Practice Exam')}
            </Button>
          </div>

          {/* Module Grid */}
          <div>
            <div className="flex items-center gap-3 mb-5">
              <Shield className="h-5 w-5 text-[#f59e0b]" />
              <h2 className="text-lg font-semibold text-zinc-100">VCA Safety Certification</h2>
              <Badge variant="outline" className="text-[10px] border-[#f59e0b]/30 text-[#f59e0b]">
                22 Modules
              </Badge>
            </div>
            <p className="text-sm text-zinc-400 mb-5">
              {t('academy.vcaDescription', 'Complete study materials and practice quizzes for B-VCA and VOL-VCA certification exams.')}
            </p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {VCA_MODULES.map((mod) => (
                <button
                  key={mod.id}
                  onClick={() => navigate(`/academy/${mod.id}`)}
                  className="group flex items-center gap-3 border border-zinc-800/80 bg-[#0d0d0d] p-4 hover:border-[#f59e0b] transition text-left rounded-md"
                >
                  <div className="h-8 w-8 rounded-md bg-[#f59e0b]/10 border border-[#f59e0b]/20 flex items-center justify-center text-xs font-bold text-[#f59e0b] shrink-0">
                    {mod.id}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-zinc-200 truncate">{mod.name}</p>
                    <p className="text-xs text-zinc-500">{moduleCounts[mod.id] || 0} questions</p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-zinc-600 group-hover:text-[#f59e0b] transition shrink-0" />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Tab: My Certificates */}
      {activeTab === 'certificates' && (
        <div className="space-y-6">
          {/* Certificate Card */}
          <div className="border border-zinc-800/80 bg-[#0d0d0d] rounded-lg p-8">
            <div className="flex items-start gap-4">
              <div className="h-14 w-14 rounded-lg bg-[#f59e0b]/10 border border-[#f59e0b]/20 flex items-center justify-center shrink-0">
                <Award className="h-7 w-7 text-[#f59e0b]" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-zinc-100">
                  {t('academy.certTitle', 'VCA Safety Certification')}
                </h3>
                <p className="text-sm text-zinc-400 mt-1">
                  {t('academy.certDescription', 'Complete all 22 VCA modules to earn your certificate of completion.')}
                </p>

                {/* Progress */}
                <div className="mt-4">
                  <div className="flex items-center justify-between text-xs text-zinc-400 mb-2">
                    <span>{t('academy.certProgress', 'Progress')}</span>
                    <span>{completedCount}/22 {t('academy.certModules', 'modules')}</span>
                  </div>
                  <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#f59e0b] rounded-full transition-all"
                      style={{ width: `${(completedCount / 22) * 100}%` }}
                    />
                  </div>
                </div>

                {/* Download Button */}
                <Button
                  onClick={handleDownloadCertificate}
                  disabled={loadingProgress}
                  className="mt-5 bg-[#f59e0b] hover:bg-[#d97706] text-black font-medium"
                >
                  <Download className="h-4 w-4 mr-2" />
                  {t('academy.certDownload', 'Download Certificate')}
                </Button>

                {completedCount < 22 && (
                  <p className="text-xs text-zinc-500 mt-3">
                    {t('academy.certRemaining', '{{remaining}} modules remaining').replace('{{remaining}}', String(22 - completedCount))}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Info */}
          <div className="border border-zinc-800/60 bg-zinc-900/30 rounded-lg p-5">
            <p className="text-sm text-zinc-400">
              {t('academy.certDisclaimer', 'This certificate confirms completion of PipingBox preparation course and does not constitute official VCA certification. Official VCA certification requires passing the exam at an accredited testing center.')}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}