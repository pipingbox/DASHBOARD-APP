import { useState } from 'react';
import { BookOpen, Calendar } from 'lucide-react';
import { VCACourseContent } from '@/components/academy/VCACourseContent';
import { VCAExamBooking } from '@/components/academy/VCAExamBooking';

/**
 * VCA Exam Booking Page
 * Combines the VCA preparation course content with the official exam booking flow.
 * Routes: /academy/vca-course and /academy/vca-booking
 */
export default function VCAExamBookingPage() {
  const [activeTab, setActiveTab] = useState<'course' | 'booking'>('course');

  return (
    <div className="space-y-6">
      {/* Tab selector */}
      <div className="flex items-center gap-2 border-b border-zinc-800/80">
        <button
          onClick={() => setActiveTab('course')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-medium border-b-2 transition-all ${
            activeTab === 'course'
              ? 'border-[#f59e0b] text-[#f59e0b]'
              : 'border-transparent text-zinc-500 hover:text-zinc-300'
          }`}
        >
          <BookOpen className="h-4 w-4" />
          Preparation Course
        </button>
        <button
          onClick={() => setActiveTab('booking')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-medium border-b-2 transition-all ${
            activeTab === 'booking'
              ? 'border-[#f59e0b] text-[#f59e0b]'
              : 'border-transparent text-zinc-500 hover:text-zinc-300'
          }`}
        >
          <Calendar className="h-4 w-4" />
          Book Official Exam
        </button>
      </div>

      {activeTab === 'course' ? <VCACourseContent /> : <VCAExamBooking />}
    </div>
  );
}
