export function loadVcaContentForLanguage<Lessons, Questions>(
  lang: string,
  loadLessons: (lang: string) => Promise<Lessons>,
  loadQuestions: (lang: string) => Promise<Questions>,
  onReady: (lessons: Lessons, questions: Questions) => void,
  onError: () => void,
): () => void {
  let active = true;
  void Promise.all([loadLessons(lang), loadQuestions(lang)]).then(
    ([lessons, questions]) => {
      if (active) onReady(lessons, questions);
    },
    () => {
      if (active) onError();
    },
  );
  return () => { active = false; };
}
