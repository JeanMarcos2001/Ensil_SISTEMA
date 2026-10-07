import { BookOpen, Briefcase, Globe, Users, Award, MonitorPlay } from "lucide-react";

export const stats = [
  { id: 1, value: "15+", label: "Años de Experiencia" },
  { id: 2, value: "10k+", label: "Egresados Exitosos" },
  { id: 3, value: "95%", label: "Tasa de Empleabilidad" },
  { id: 4, value: "50+", label: "Convenios Corporativos" },
];

export const programs = [
  {
    id: "desarrollo-software",
    title: "Desarrollo de Software",
    description: "Domina lenguajes modernos y arquitecturas cloud para crear soluciones tecnológicas de alto impacto.",
    duration: "3 años (6 ciclos)",
    modality: "Presencial / Semipresencial",
    image: "https://images.unsplash.com/photo-1517694712202-14dd9538aa97?q=80&w=800&auto=format&fit=crop",
    icon: MonitorPlay,
  },
  {
    id: "marketing-digital",
    title: "Marketing Digital",
    description: "Estrategias SEO/SEM, analítica web y gestión de comunidades para liderar marcas en el entorno digital.",
    duration: "3 años (6 ciclos)",
    modality: "100% Virtual",
    image: "https://images.unsplash.com/photo-1432888498266-38ffec3eaf0a?q=80&w=800&auto=format&fit=crop",
    icon: Globe,
  },
  {
    id: "administracion-negocios",
    title: "Administración de Negocios",
    description: "Lidera equipos, optimiza recursos y crea modelos de negocio innovadores y rentables.",
    duration: "3 años (6 ciclos)",
    modality: "Presencial",
    image: "https://images.unsplash.com/photo-1552664730-d307ca884978?q=80&w=800&auto=format&fit=crop",
    icon: Briefcase,
  },
];

export const features = [
  {
    id: 1,
    title: "Metodología Práctica",
    description: "Aprende haciendo. Proyectos reales desde el primer ciclo con empresas aliadas.",
    icon: BookOpen,
  },
  {
    id: 2,
    title: "Docentes Expertos",
    description: "Profesionales activos en el mercado laboral que comparten su experiencia real.",
    icon: Users,
  },
  {
    id: 3,
    title: "Bolsa de Trabajo",
    description: "Acceso exclusivo a ofertas laborales y asesoría para tu primera entrevista.",
    icon: Briefcase,
  },
  {
    id: 4,
    title: "Licenciamiento MINEDU",
    description: "Cumplimos con las Condiciones Básicas de Calidad exigidas por el Estado Peruano.",
    icon: Award,
  },
];

export const testimonials = [
  {
    id: 1,
    name: "Carlos Mendoza",
    role: "Egresado de Desarrollo de Software",
    company: "Tech Solutions SAC",
    content: "Gracias al instituto conseguí mi primer trabajo como Junior Developer antes de terminar la carrera. La malla curricular está totalmente actualizada.",
    image: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?q=80&w=200&auto=format&fit=crop",
  },
  {
    id: 2,
    name: "Lucía Ramírez",
    role: "Egresada de Marketing Digital",
    company: "Agencia Creativa Lima",
    content: "Los profesores no solo enseñan teoría, te muestran casos reales. Eso me dio la confianza para liderar campañas desde el día uno.",
    image: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?q=80&w=200&auto=format&fit=crop",
  },
];
