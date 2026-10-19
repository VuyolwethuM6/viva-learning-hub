export type StudyMaterial = {
  title: string;
  subtitle: string;
  grade: 8 | 9 | 10 | 11 | 12;
  subject: string;
  examSession: 'March' | 'June' | 'September' | 'November/December' | 'General revision' | null;
  keywords: string[];
  description: string;
  price: string;
  amount: string;
  isFree: boolean;
  file: string;
  pages?: number;
  badge: string;
  accent: string;
  includes: string[];
};

export function getStudyMaterialFileName(material: StudyMaterial) {
  return material.file.split('/').pop() ?? 'study-material.pdf';
}

export function getStudyMaterialDownloadUrl(material: StudyMaterial) {
  return `/download/${encodeURIComponent(getStudyMaterialFileName(material))}`;
}

export const studyMaterials: StudyMaterial[] = [
  {
    title: 'Grade 12 Algebra Equations and Inequalities Practice',
    subtitle: 'Algebra',
    grade: 12,
    subject: 'Mathematics',
    examSession: 'General revision',
    keywords: ['grade 12', 'matric', 'maths', 'algebra', 'equations', 'inequalities'],
    description: 'Algebra equations and inequalities practice PDF for Grade 12 revision.',
    price: 'Free',
    amount: '0.00',
    isFree: true,
    file: '/materials/01. Algebra Equations And Inequalities Practice Problem.pdf',
    badge: 'Free PDF',
    accent: 'from-emerald-500 to-teal-600',
    includes: ['Algebra practice', 'Equations and inequalities', 'Grade 12 revision'],
  },
  {
    title: 'Sequence and Series Practice',
    subtitle: 'Sequence and Series',
    grade: 12,
    subject: 'Mathematics',
    examSession: 'General revision',
    keywords: ['grade 12', 'matric', 'maths', 'sequences', 'series', 'revision'],
    description: 'Grade 12 practice problems for arithmetic and geometric sequences and series.',
    price: 'Free',
    amount: '0.00',
    isFree: true,
    file: '/materials/02. Sequence And Series Practice Problems.pdf',
    pages: 18,
    badge: 'Free PDF',
    accent: 'from-emerald-500 to-teal-600',
    includes: ['Sequences and series', 'Practice questions', 'Exam-style layout', 'Revision summary'],
  },
  {
    title: 'Grade 12 Euclidean Geometry Practice Questions',
    subtitle: 'Euclidean Geometry',
    grade: 12,
    subject: 'Mathematics',
    examSession: 'General revision',
    keywords: ['grade 12', 'matric', 'maths', 'euclidean geometry', 'geometry'],
    description: 'Euclidean geometry practice questions for Grade 12 Mathematics revision.',
    price: 'Free',
    amount: '0.00',
    isFree: true,
    file: '/materials/04. Eucledian Geometry Practice Questions.pdf',
    badge: 'Free PDF',
    accent: 'from-teal-500 to-cyan-600',
    includes: ['Geometry practice', 'Grade 12 Mathematics', 'Exam revision'],
  },
  {
    title: 'Trigonometry Practice Questions',
    subtitle: 'Trigonometry',
    grade: 12,
    subject: 'Mathematics',
    examSession: 'General revision',
    keywords: ['grade 12', 'matric', 'maths', 'trigonometry', 'revision'],
    description: 'Exam-focused trigonometry questions for Grade 12 revision.',
    price: 'Free',
    amount: '0.00',
    isFree: true,
    file: '/materials/03. Trigonometry Practice Questions.pdf',
    pages: 148,
    badge: 'Free PDF',
    accent: 'from-cyan-500 to-sky-600',
    includes: ['Trigonometry', 'Worked questions', 'Exam preparation', 'CAPS aligned'],
  },
  {
    title: 'Analytical Geometry Practice',
    subtitle: 'Analytical Geometry',
    grade: 12,
    subject: 'Mathematics',
    examSession: 'General revision',
    keywords: ['grade 12', 'matric', 'maths', 'analytical geometry', 'coordinate geometry', 'revision'],
    description: 'Analytical geometry practice questions for focused exam preparation.',
    price: 'R299',
    amount: '299.00',
    isFree: false,
    file: '02. Analytical Geometry Practice Questions.pdf',
    pages: 133,
    badge: 'PayFast',
    accent: 'from-[#7949fe] to-[#ff7849]',
    includes: ['Coordinate geometry', 'Practice problems', 'Exam-style questions', 'Revision focus areas'],
  },
  {
    title: 'Finance Practice Questions',
    subtitle: 'Finance',
    grade: 12,
    subject: 'Mathematics',
    examSession: 'General revision',
    keywords: ['grade 12', 'matric', 'maths', 'finance', 'financial mathematics', 'revision'],
    description: 'Finance practice questions for structured mathematics revision.',
    price: 'R399',
    amount: '399.00',
    isFree: false,
    file: '04. Finance Practice Questions.pdf',
    pages: 11,
    badge: 'PayFast',
    accent: 'from-amber-500 to-orange-600',
    includes: ['Finance concepts', 'Practice questions', 'Exam-style layout', 'Revision checklist'],
  },
];
