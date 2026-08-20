-- Tabla de progreso por modulo
CREATE TABLE IF NOT EXISTS app_14da0f1941_academy_progress (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  module_id INTEGER NOT NULL CHECK (module_id >= 1 AND module_id <= 22),
  completed BOOLEAN DEFAULT false,
  score DECIMAL(5,2) DEFAULT 0,
  best_score DECIMAL(5,2) DEFAULT 0,
  attempts INTEGER DEFAULT 0,
  last_attempt_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, module_id)
);

-- Tabla de examenes simulacro
CREATE TABLE IF NOT EXISTS app_14da0f1941_academy_mock_exams (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  exam_type TEXT NOT NULL CHECK (exam_type IN ('bvca', 'volvca')),
  total_questions INTEGER NOT NULL,
  correct_answers INTEGER NOT NULL,
  passed BOOLEAN NOT NULL,
  duration_seconds INTEGER NOT NULL,
  completed_at TIMESTAMPTZ DEFAULT now()
);

-- Tabla de respuestas detalladas (opcional, para analiticas)
CREATE TABLE IF NOT EXISTS app_14da0f1941_academy_exam_answers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  mock_exam_id UUID REFERENCES app_14da0f1941_academy_mock_exams(id) ON DELETE CASCADE NOT NULL,
  question_id INTEGER NOT NULL,
  selected_answer CHAR(1) CHECK (selected_answer IN ('A', 'B', 'C')),
  correct_answer CHAR(1) NOT NULL CHECK (correct_answer IN ('A', 'B', 'C')),
  is_correct BOOLEAN NOT NULL
);

-- RLS Policies
ALTER TABLE app_14da0f1941_academy_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_14da0f1941_academy_mock_exams ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_14da0f1941_academy_exam_answers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own progress" ON app_14da0f1941_academy_progress
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own progress" ON app_14da0f1941_academy_progress
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own progress" ON app_14da0f1941_academy_progress
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can read own exams" ON app_14da0f1941_academy_mock_exams
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own exams" ON app_14da0f1941_academy_mock_exams
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can read own exam answers" ON app_14da0f1941_academy_exam_answers
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM app_14da0f1941_academy_mock_exams
      WHERE id = app_14da0f1941_academy_exam_answers.mock_exam_id
      AND user_id = auth.uid()
    )
  );
CREATE POLICY "Users can insert own exam answers" ON app_14da0f1941_academy_exam_answers
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM app_14da0f1941_academy_mock_exams
      WHERE id = app_14da0f1941_academy_exam_answers.mock_exam_id
      AND user_id = auth.uid()
    )
  );

-- Indices
CREATE INDEX IF NOT EXISTS idx_academy_progress_user ON app_14da0f1941_academy_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_academy_mock_exams_user ON app_14da0f1941_academy_mock_exams(user_id);
CREATE INDEX IF NOT EXISTS idx_academy_exam_answers_exam ON app_14da0f1941_academy_exam_answers(mock_exam_id);