import React, { useState, useMemo } from 'react';
import { Button } from '../components/ui/Button';
import { useData } from '../context/DataContext';
import { Search, UserPlus, Plus, Trash2, CheckCircle2, Check, AlertCircle, X } from 'lucide-react';

interface NewEnrollmentWizardProps {
  onClose: () => void;
}

export function NewEnrollmentWizard({ onClose }: NewEnrollmentWizardProps) {
  const { addEnrollmentFlow, branches, leadSources, staff, assignments, guardians, students } = useData();
  const [step, setStep] = useState(() => {
    const saved = localStorage.getItem('enrollmentDraftStep');
    return saved ? parseInt(saved, 10) : 1;
  });
  const totalSteps = 6;

  const [formData, setFormData] = useState(() => {
    const saved = localStorage.getItem('enrollmentDraftData');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {}
    }
    return {
      contexto: { sedeId: '', fecha: new Date().toISOString().split('T')[0], origenId: '', ejecutivoId: '', observacion: '' },
      titulares: [
        { id: '', exists: false, tipoDoc: 'dni', documento: '', nombres: '', apellidoP: '', apellidoM: '', telefono: '', email: '', parentesco: 'Padre', direccion: '' }
      ],
      students: [
        { id: '', exists: false, documento: '', nombres: '', apellidoP: '', apellidoM: '', edad: '', grado: '', colegio: '', programa: 'Kids', nivel: 'Básico 1', horario: '', fechaInicio: '' }
      ],
      plan: { tipo: 'cuotas', cuotas: 6, total: 1200 },
      payment: { monto: 200, metodo: 'transferencia', operacion: '' }
    };
  });

  const [searchTerms, setSearchTerms] = useState({ titular: ['', ''], student: ['', ''] });
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Filter staff for "Psicopedagogía"
  const ejecutivos = useMemo(() => {
    const psychoStaffIds = assignments
      .filter(a => a.area === 'Psicopedagogía')
      .map(a => a.staffId);
    return staff.filter(s => psychoStaffIds.includes(s.id));
  }, [staff, assignments]);

  const STEPS_CONFIG = [
    {
      label: 'Contexto',
      description: 'Base comercial y sede',
      title: 'Contexto del registro',
      subtitle: 'Define el contexto comercial y operativo desde donde se generará la matrícula.'
    },
    {
      label: 'Titulares',
      description: 'Responsables del registro',
      title: 'Titulares y Responsables',
      subtitle: 'Ingresa los datos de los padres o apoderados responsables de la matrícula.'
    },
    {
      label: 'Alumnos',
      description: 'Beneficiarios a matricular',
      title: 'Datos de los Alumnos',
      subtitle: 'Registra la información personal y académica de los estudiantes.'
    },
    {
      label: 'Programa',
      description: 'Programa, nivel y modalidad',
      title: 'Selección de Programa',
      subtitle: 'Elige el programa de estudio, nivel, modalidad y horarios deseados.'
    },
    {
      label: 'Pago inicial',
      description: 'Pago inmediato y condiciones',
      title: 'Pago Inicial y Facturación',
      subtitle: 'Registra el pago de matrícula y configura los datos de facturación.'
    },
    {
      label: 'Resumen',
      description: 'Validación final del expediente',
      title: 'Resumen de Matrícula',
      subtitle: 'Verifica que toda la información ingresada sea correcta antes de confirmar.'
    }
  ];

  const nextStep = () => {
    setFormError(null);
    if (step === 1) {
      if (!formData.contexto.sedeId || !formData.contexto.ejecutivoId || !formData.contexto.origenId) {
        setFormError('Por favor complete los campos obligatorios (*)');
        return;
      }
    }
    if (step === 2) {
      const t1 = formData.titulares[0];
      if (t1.exists) {
        if (!t1.id) { setFormError('Seleccione un titular existente'); return; }
      } else {
        if (!t1.documento || !t1.nombres || !t1.apellidoP || !t1.telefono) {
          setFormError('Complete los datos obligatorios del Titular 1');
          return;
        }
      }
    }
    if (step === 3) {
      const s1 = formData.students[0];
      if (s1.exists) {
        if (!s1.id) { setFormError('Seleccione un alumno existente'); return; }
      } else {
        if (!s1.nombres || !s1.apellidoP || !s1.edad) {
          setFormError('Complete los datos obligatorios del Alumno 1');
          return;
        }
      }
    }
    if (step === 4) {
      if (!formData.students[0].horario || !formData.students[0].fechaInicio || !formData.plan.total) {
        setFormError('Por favor complete los detalles del programa y plan (*)');
        return;
      }
    }
    if (step === 5) {
      if (!formData.payment.monto) {
        setFormError('Por favor ingrese el monto inicial (*)');
        return;
      }
      if ((formData.payment.metodo === 'transferencia' || formData.payment.metodo === 'yape') && !formData.payment.operacion) {
        setFormError('Por favor ingrese el N° de operación (*)');
        return;
      }
    }
    setStep(s => Math.min(s + 1, totalSteps));
  };
  const prevStep = () => setStep(s => Math.max(s - 1, 1));

  const handleConfirm = () => {
    addEnrollmentFlow(formData);
    localStorage.removeItem('enrollmentDraftStep');
    localStorage.removeItem('enrollmentDraftData');
    onClose();
  };

  const handleCancelClick = () => {
    if (step > 1) {
      setShowCancelConfirm(true);
    } else {
      localStorage.removeItem('enrollmentDraftStep');
      localStorage.removeItem('enrollmentDraftData');
      onClose();
    }
  };

  const updateForm = (section: string, field: string, value: any, index?: number) => {
    if (section === 'titulares' || section === 'students') {
      const idx = index ?? 0;
      setFormData(prev => {
        const newList = [...(prev[section as 'titulares' | 'students'] as any[])];
        newList[idx] = { ...newList[idx], [field]: value };
        return { ...prev, [section]: newList };
      });
    } else {
      setFormData(prev => ({
        ...prev,
        [section]: { ...prev[section as keyof typeof formData] as any, [field]: value }
      }));
    }
  };

  const addSecondTitular = () => {
    if (formData.titulares.length < 2) {
      setFormData(prev => ({
        ...prev,
        titulares: [...prev.titulares, { id: '', exists: false, tipoDoc: 'dni', documento: '', nombres: '', apellidoP: '', apellidoM: '', telefono: '', email: '', parentesco: 'Madre', direccion: '' }]
      }));
    }
  };

  const addSecondStudent = () => {
    if (formData.students.length < 2) {
      setFormData(prev => ({
        ...prev,
        students: [...prev.students, { id: '', exists: false, documento: '', nombres: '', apellidoP: '', apellidoM: '', edad: '', grado: '', colegio: '', programa: 'Kids', nivel: 'Básico 1', horario: '', fechaInicio: '' }]
      }));
    }
  };

  const removeTitular = (idx: number) => {
    if (idx === 0) return;
    setFormData(prev => ({ ...prev, titulares: prev.titulares.filter((_, i) => i !== idx) }));
  };

  const removeStudent = (idx: number) => {
    if (idx === 0) return;
    setFormData(prev => ({ ...prev, students: prev.students.filter((_, i) => i !== idx) }));
  };

  return (
    <div className="flex flex-col h-[75vh] -m-6">
      <div className="flex flex-1 min-h-0">
        {/* Progress Indicator (Left Sidebar) */}
        <div className="w-[35%] border-r border-border-soft pl-[8vw] pr-8 py-6 flex flex-col overflow-y-auto">
          {STEPS_CONFIG.map((stepConfig, idx) => {
            const stepNum = idx + 1;
            const isActive = step === stepNum;
            const isPast = step > stepNum;
            const isLast = idx === STEPS_CONFIG.length - 1;
            
            return (
              <div 
                key={stepConfig.label} 
                className={`relative flex items-start gap-4 ${isLast ? '' : 'pb-10'} ${isPast ? 'cursor-pointer group' : ''}`}
                onClick={() => isPast && setStep(stepNum)}
              >
                {/* Vertical Line */}
                {!isLast && (
                  <div className={`absolute left-[23px] top-[48px] bottom-0 w-[2px] ${isPast ? 'bg-success-text/40' : 'bg-border-soft'}`} />
                )}
                
                {/* Circle */}
                <div 
                  className={`relative z-10 w-12 h-12 rounded-full flex items-center justify-center text-lg font-medium transition-colors shrink-0 ${
                    isPast ? 'bg-success-tint text-success-text group-hover:bg-success-tint/80' : 
                    isActive ? 'bg-primary-accent text-white shadow-md' : 
                    'bg-surface border-2 border-border-soft text-text-primary'
                  }`}
                >
                  {isPast ? <Check size={24} strokeWidth={3} /> : stepNum}
                </div>
                
                {/* Label */}
                <div className="flex flex-col pt-1.5">
                  <span className={`transition-colors ${
                    isActive ? 'text-[18px] font-semibold text-primary-accent' : 
                    isPast ? 'text-[16px] font-semibold text-text-primary group-hover:text-primary-accent' : 
                    'text-[16px] font-medium text-text-muted'
                  }`}>
                    {stepConfig.label}
                  </span>
                  <span className={`text-[13px] mt-0.5 leading-tight ${
                    isActive ? 'text-text-secondary font-medium' : 
                    isPast ? 'text-text-muted' : 
                    'text-text-muted/70'
                  }`}>
                    {stepConfig.description}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Step Content (Right Side) */}
        <div className="flex-1 overflow-y-auto pl-12 pr-[8vw] py-6 relative">
          {formError && (
             <div className="absolute top-6 left-12 right-[8vw] z-50 animate-in fade-in slide-in-from-top-2">
                <div className="bg-danger/10 border border-danger/20 rounded-xl p-3 flex items-center gap-3 text-danger text-sm font-medium shadow-sm backdrop-blur-sm">
                   <AlertCircle size={18} />
                   {formError}
                   <button onClick={() => setFormError(null)} className="ml-auto hover:bg-danger/10 p-1 rounded-lg transition-colors">
                     <X size={16} />
                   </button>
                </div>
             </div>
          )}
        {step === 1 && (
          <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
            <div>
              <h3 className="text-[28px] font-bold text-text-primary leading-tight">{STEPS_CONFIG[0].title}</h3>
              <p className="text-[14px] font-normal text-text-secondary mt-1">{STEPS_CONFIG[0].subtitle}</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-text-secondary">Sede *</label>
                <select 
                  value={formData.contexto.sedeId} 
                  onChange={e => updateForm('contexto', 'sedeId', e.target.value)} 
                  className="w-full h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm focus:border-primary-accent outline-none"
                >
                  <option value="">Seleccionar sede...</option>
                  {branches.filter(b => b.status === 'Activo').map(b => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-text-secondary">Fecha de matrícula *</label>
                <input type="date" value={formData.contexto.fecha} onChange={e => updateForm('contexto', 'fecha', e.target.value)} className="w-full h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm focus:border-primary-accent outline-none" />
              </div>
              <div className="space-y-1.5 col-span-2">
                <label className="text-sm font-medium text-text-secondary">Origen del lead *</label>
                <select 
                  value={formData.contexto.origenId} 
                  onChange={e => updateForm('contexto', 'origenId', e.target.value)} 
                  className="w-full h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm focus:border-primary-accent outline-none"
                >
                  <option value="">Seleccionar origen...</option>
                  {leadSources.filter(s => s.status === 'active').map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5 col-span-2">
                <label className="text-sm font-medium text-text-secondary">Ejecutivo *</label>
                <select 
                  value={formData.contexto.ejecutivoId} 
                  onChange={e => updateForm('contexto', 'ejecutivoId', e.target.value)} 
                  className="w-full h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm focus:border-primary-accent outline-none"
                >
                  <option value="">Seleccionar ejecutivo...</option>
                  {ejecutivos.map(s => (
                    <option key={s.id} value={s.id}>{s.names} {s.lastNameP}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5 col-span-2">
                <label className="text-sm font-medium text-text-secondary">Observación general</label>
                <textarea value={formData.contexto.observacion} onChange={e => updateForm('contexto', 'observacion', e.target.value)} className="w-full h-24 bg-surface border border-border-soft rounded-xl p-3 text-sm focus:border-primary-accent outline-none resize-none" placeholder="Opcional..."></textarea>
              </div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
            <div>
              <h3 className="text-[28px] font-bold text-text-primary leading-tight">{STEPS_CONFIG[1].title}</h3>
              <p className="text-[14px] font-normal text-text-secondary mt-1">{STEPS_CONFIG[1].subtitle}</p>
            </div>
            {formData.titulares.map((titular, idx) => (
              <div key={idx} className="space-y-4 p-4 bg-surface-muted/30 border border-border-soft rounded-xl relative">
                <div className="flex justify-between items-center mb-2">
                  <h3 className="text-md font-bold text-text-primary">Titular {idx + 1}</h3>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => updateForm('titulares', 'exists', !titular.exists, idx)}
                      className={`h-8 px-3 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${titular.exists ? 'bg-primary-accent text-white' : 'bg-surface border border-border-soft text-text-secondary hover:border-primary-accent'}`}
                    >
                      {titular.exists ? <CheckCircle2 size={14} /> : <Search size={14} />}
                      TITULAR EXISTENTE
                    </button>
                    {idx > 0 && (
                      <button onClick={() => removeTitular(idx)} className="text-danger-text hover:bg-danger-tint p-1.5 rounded-lg transition-colors">
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                </div>

                <div className="space-y-4">

                  {titular.exists ? (
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-text-secondary">Buscar Titular</label>
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" size={16} />
                        <input 
                          type="text"
                          placeholder="Nombre o DNI..."
                          value={searchTerms.titular[idx]}
                          onChange={(e) => {
                            const val = e.target.value;
                            setSearchTerms(prev => {
                              const nt = [...prev.titular];
                              nt[idx] = val;
                              return { ...prev, titular: nt };
                            });
                          }}
                          className="w-full h-10 bg-surface border border-border-soft rounded-xl pl-9 pr-3 text-sm focus:border-primary-accent outline-none"
                        />
                      </div>
                      {searchTerms.titular[idx].length > 1 && (
                        <div className="mt-2 border border-border-soft rounded-xl bg-surface overflow-hidden shadow-lg max-h-40 overflow-y-auto">
                          {guardians
                            .filter(g => g.name.toLowerCase().includes(searchTerms.titular[idx].toLowerCase()) || g.doc.includes(searchTerms.titular[idx]))
                            .map(g => (
                              <button 
                                key={g.id}
                                onClick={() => {
                                  updateForm('titulares', 'id', g.id, idx);
                                  updateForm('titulares', 'nombres', g.name, idx);
                                  setSearchTerms(prev => {
                                    const nt = [...prev.titular];
                                    nt[idx] = g.name;
                                    return { ...prev, titular: nt };
                                  });
                                }}
                                className={`w-full px-4 py-2 text-left text-sm hover:bg-surface-muted flex justify-between items-center ${titular.id === g.id ? 'bg-primary-accent/5 text-primary-accent' : 'text-text-primary'}`}
                              >
                                <span>{g.name} ({g.doc})</span>
                                {titular.id === g.id && <CheckCircle2 size={14} />}
                              </button>
                            ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-sm font-medium text-text-secondary">Tipo Doc *</label>
                        <select value={titular.tipoDoc} onChange={e => updateForm('titulares', 'tipoDoc', e.target.value, idx)} className="w-full h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm focus:border-primary-accent outline-none">
                          <option value="dni">DNI</option>
                          <option value="ce">CE</option>
                        </select>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-sm font-medium text-text-secondary">N° Documento *</label>
                        <input type="text" value={titular.documento} onChange={e => updateForm('titulares', 'documento', e.target.value, idx)} className="w-full h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm focus:border-primary-accent outline-none" />
                      </div>
                      <div className="space-y-1.5 col-span-2">
                        <label className="text-sm font-medium text-text-secondary">Nombres *</label>
                        <input type="text" value={titular.nombres} onChange={e => updateForm('titulares', 'nombres', e.target.value, idx)} className="w-full h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm focus:border-primary-accent outline-none" />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-sm font-medium text-text-secondary">Apellido Paterno *</label>
                        <input type="text" value={titular.apellidoP} onChange={e => updateForm('titulares', 'apellidoP', e.target.value, idx)} className="w-full h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm focus:border-primary-accent outline-none" />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-sm font-medium text-text-secondary">Apellido Materno</label>
                        <input type="text" value={titular.apellidoM} onChange={e => updateForm('titulares', 'apellidoM', e.target.value, idx)} className="w-full h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm focus:border-primary-accent outline-none" />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-sm font-medium text-text-secondary">Teléfono principal *</label>
                        <input type="tel" value={titular.telefono} onChange={e => updateForm('titulares', 'telefono', e.target.value, idx)} className="w-full h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm focus:border-primary-accent outline-none" />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-sm font-medium text-text-secondary">Correo electrónico</label>
                        <input type="email" value={titular.email} onChange={e => updateForm('titulares', 'email', e.target.value, idx)} className="w-full h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm focus:border-primary-accent outline-none" />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-sm font-medium text-text-secondary">Parentesco *</label>
                        <select value={titular.parentesco} onChange={e => updateForm('titulares', 'parentesco', e.target.value, idx)} className="w-full h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm focus:border-primary-accent outline-none">
                          <option value="Padre">Padre</option>
                          <option value="Madre">Madre</option>
                          <option value="Apoderado">Apoderado</option>
                          <option value="Otro">Otro</option>
                        </select>
                      </div>
                      <div className="space-y-1.5 col-span-2">
                        <label className="text-sm font-medium text-text-secondary">Dirección de domicilio *</label>
                        <input type="text" value={titular.direccion} onChange={e => updateForm('titulares', 'direccion', e.target.value, idx)} className="w-full h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm focus:border-primary-accent outline-none" placeholder="Av. Ejemplo 123, Distrito" />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}

            {formData.titulares.length < 2 && (
              <button 
                onClick={addSecondTitular}
                className="w-full py-3 border-2 border-dashed border-border-soft rounded-xl text-text-secondary hover:border-primary-accent hover:text-primary-accent transition-all flex items-center justify-center gap-2 font-medium"
              >
                <Plus size={18} />
                Agregar Titular 2
              </button>
            )}
          </div>
        )}

        {step === 3 && (
          <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
            <div>
              <h3 className="text-[28px] font-bold text-text-primary leading-tight">{STEPS_CONFIG[2].title}</h3>
              <p className="text-[14px] font-normal text-text-secondary mt-1">{STEPS_CONFIG[2].subtitle}</p>
            </div>
            {formData.students.map((student, idx) => (
              <div key={idx} className="space-y-4 p-4 bg-surface-muted/30 border border-border-soft rounded-xl relative">
                <div className="flex justify-between items-center mb-2">
                  <h3 className="text-md font-bold text-text-primary">Alumno {idx + 1}</h3>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => updateForm('students', 'exists', !student.exists, idx)}
                      className={`h-8 px-3 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${student.exists ? 'bg-primary-accent text-white' : 'bg-surface border border-border-soft text-text-secondary hover:border-primary-accent'}`}
                    >
                      {student.exists ? <CheckCircle2 size={14} /> : <Search size={14} />}
                      ALUMNO EXISTENTE
                    </button>
                    {idx > 0 && (
                      <button onClick={() => removeStudent(idx)} className="text-danger-text hover:bg-danger-tint p-1.5 rounded-lg transition-colors">
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                </div>

                {student.exists ? (
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-text-secondary">Buscar Alumno</label>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" size={16} />
                      <input 
                        type="text"
                        placeholder="Nombre o DNI..."
                        value={searchTerms.student[idx]}
                        onChange={(e) => {
                          const val = e.target.value;
                          setSearchTerms(prev => {
                            const nt = [...prev.student];
                            nt[idx] = val;
                            return { ...prev, student: nt };
                          });
                        }}
                        className="w-full h-10 bg-surface border border-border-soft rounded-xl pl-9 pr-3 text-sm focus:border-primary-accent outline-none"
                      />
                    </div>
                    {searchTerms.student[idx].length > 1 && (
                      <div className="mt-2 border border-border-soft rounded-xl bg-surface overflow-hidden shadow-lg max-h-40 overflow-y-auto">
                        {students
                          .filter(s => s.name.toLowerCase().includes(searchTerms.student[idx].toLowerCase()) || s.doc.includes(searchTerms.student[idx]))
                          .map(s => (
                            <button 
                              key={s.id}
                              onClick={() => {
                                updateForm('students', 'id', s.id, idx);
                                updateForm('students', 'nombres', s.name, idx);
                                setSearchTerms(prev => {
                                  const nt = [...prev.student];
                                  nt[idx] = s.name;
                                  return { ...prev, student: nt };
                                });
                              }}
                              className={`w-full px-4 py-2 text-left text-sm hover:bg-surface-muted flex justify-between items-center ${student.id === s.id ? 'bg-primary-accent/5 text-primary-accent' : 'text-text-primary'}`}
                            >
                              <span>{s.name} ({s.doc})</span>
                              {student.id === s.id && <CheckCircle2 size={14} />}
                            </button>
                          ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium text-text-secondary">DNI (Opcional)</label>
                      <input type="text" value={student.documento} onChange={e => updateForm('students', 'documento', e.target.value, idx)} className="w-full h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm focus:border-primary-accent outline-none" />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium text-text-secondary">Edad *</label>
                      <input type="number" value={student.edad} onChange={e => updateForm('students', 'edad', e.target.value, idx)} className="w-full h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm focus:border-primary-accent outline-none" />
                    </div>
                    <div className="space-y-1.5 col-span-2">
                      <label className="text-sm font-medium text-text-secondary">Nombres *</label>
                      <input type="text" value={student.nombres} onChange={e => updateForm('students', 'nombres', e.target.value, idx)} className="w-full h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm focus:border-primary-accent outline-none" />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium text-text-secondary">Apellido Paterno *</label>
                      <input type="text" value={student.apellidoP} onChange={e => updateForm('students', 'apellidoP', e.target.value, idx)} className="w-full h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm focus:border-primary-accent outline-none" />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium text-text-secondary">Apellido Materno</label>
                      <input type="text" value={student.apellidoM} onChange={e => updateForm('students', 'apellidoM', e.target.value, idx)} className="w-full h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm focus:border-primary-accent outline-none" />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium text-text-secondary">Grado escolar</label>
                      <input type="text" value={student.grado} onChange={e => updateForm('students', 'grado', e.target.value, idx)} className="w-full h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm focus:border-primary-accent outline-none" />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium text-text-secondary">Colegio</label>
                      <input type="text" value={student.colegio} onChange={e => updateForm('students', 'colegio', e.target.value, idx)} className="w-full h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm focus:border-primary-accent outline-none" />
                    </div>
                  </div>
                )}
              </div>
            ))}

            {formData.students.length < 2 && (
              <button 
                onClick={addSecondStudent}
                className="w-full py-3 border-2 border-dashed border-border-soft rounded-xl text-text-secondary hover:border-primary-accent hover:text-primary-accent transition-all flex items-center justify-center gap-2 font-medium"
              >
                <Plus size={18} />
                Añadir nuevo alumno
              </button>
            )}
          </div>
        )}

        {step === 4 && (
          <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
            <div>
              <h3 className="text-[28px] font-bold text-text-primary leading-tight">{STEPS_CONFIG[3].title}</h3>
              <p className="text-[14px] font-normal text-text-secondary mt-1">{STEPS_CONFIG[3].subtitle}</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-text-secondary">Programa *</label>
                <select value={formData.students[0].programa} onChange={e => updateForm('students', 'programa', e.target.value, 0)} className="w-full h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm focus:border-primary-accent outline-none">
                  <option value="Kids">Kids</option>
                  <option value="Teens">Teens</option>
                  <option value="Pre-Kids">Pre-Kids</option>
                  <option value="Especialización">Especialización</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-text-secondary">Nivel *</label>
                <input type="text" value={formData.students[0].nivel} onChange={e => updateForm('students', 'nivel', e.target.value, 0)} className="w-full h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm focus:border-primary-accent outline-none" />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-text-secondary">Horario *</label>
                <select value={formData.students[0].horario} onChange={e => updateForm('students', 'horario', e.target.value, 0)} className="w-full h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm focus:border-primary-accent outline-none">
                  <option value="">Seleccionar horario...</option>
                  <option value="L-M-V 4:00 PM">L-M-V 4:00 PM</option>
                  <option value="L-M-V 5:00 PM">L-M-V 5:00 PM</option>
                  <option value="Sábados 9:00 AM">Sábados 9:00 AM</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-text-secondary">Fecha de Inicio *</label>
                <input type="date" value={formData.students[0].fechaInicio} onChange={e => updateForm('students', 'fechaInicio', e.target.value, 0)} className="w-full h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm focus:border-primary-accent outline-none" />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-text-secondary">Tipo de Pago *</label>
                <select value={formData.plan.tipo} onChange={e => updateForm('plan', 'tipo', e.target.value)} className="w-full h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm focus:border-primary-accent outline-none">
                  <option value="cuotas">En Cuotas</option>
                  <option value="contado">Al Contado</option>
                </select>
              </div>
              {formData.plan.tipo === 'cuotas' && (
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-text-secondary">N° Cuotas *</label>
                  <input type="number" value={formData.plan.cuotas} onChange={e => updateForm('plan', 'cuotas', parseInt(e.target.value))} className="w-full h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm focus:border-primary-accent outline-none" />
                </div>
              )}
              <div className="space-y-1.5 col-span-2">
                <label className="text-sm font-medium text-text-secondary">Total del Programa (S/) *</label>
                <input type="number" value={formData.plan.total} onChange={e => updateForm('plan', 'total', parseFloat(e.target.value))} className="w-full h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm focus:border-primary-accent outline-none" />
              </div>
            </div>
          </div>
        )}

        {step === 5 && (
          <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
            <div>
              <h3 className="text-[28px] font-bold text-text-primary leading-tight">{STEPS_CONFIG[4].title}</h3>
              <p className="text-[14px] font-normal text-text-secondary mt-1">{STEPS_CONFIG[4].subtitle}</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-text-secondary">Monto a Pagar Hoy (S/) *</label>
                <input type="number" value={formData.payment.monto} onChange={e => updateForm('payment', 'monto', parseFloat(e.target.value))} className="w-full h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm focus:border-primary-accent outline-none" />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-text-secondary">Medio de Pago *</label>
                <select value={formData.payment.metodo} onChange={e => updateForm('payment', 'metodo', e.target.value)} className="w-full h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm focus:border-primary-accent outline-none">
                  <option value="transferencia">Transferencia</option>
                  <option value="yape">Yape / Plin</option>
                  <option value="efectivo">Efectivo</option>
                  <option value="tarjeta">Tarjeta</option>
                </select>
              </div>
              {(formData.payment.metodo === 'transferencia' || formData.payment.metodo === 'yape') && (
                <div className="space-y-1.5 col-span-2">
                  <label className="text-sm font-medium text-text-secondary">N° de Operación *</label>
                  <input type="text" value={formData.payment.operacion} onChange={e => updateForm('payment', 'operacion', e.target.value)} className="w-full h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm focus:border-primary-accent outline-none" placeholder="Ej: 123456789" />
                </div>
              )}
            </div>
          </div>
        )}

        {step === 6 && (
          <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
            <div>
              <h3 className="text-[28px] font-bold text-text-primary leading-tight">{STEPS_CONFIG[5].title}</h3>
              <p className="text-[14px] font-normal text-text-secondary mt-1">{STEPS_CONFIG[5].subtitle}</p>
            </div>
            <div className="bg-surface-muted border border-border-soft rounded-xl p-4 space-y-3">
              <div className="flex justify-between border-b border-border-soft pb-2">
                <span className="text-sm text-text-secondary">Sede / Ejecutivo</span>
                <span className="text-sm font-medium text-text-primary">
                  {branches.find(b => b.id === formData.contexto.sedeId)?.name} / {ejecutivos.find(s => s.id === formData.contexto.ejecutivoId)?.names || 'Sin asignar'}
                </span>
              </div>
              <div className="flex justify-between border-b border-border-soft pb-2">
                <span className="text-sm text-text-secondary">Titular(es)</span>
                <span className="text-sm font-medium text-text-primary">
                  {formData.titulares.map(t => t.nombres).join(', ')}
                </span>
              </div>
              <div className="flex justify-between border-b border-border-soft pb-2">
                <span className="text-sm text-text-secondary">Alumno(s)</span>
                <span className="text-sm font-medium text-text-primary">
                  {formData.students.map(s => s.nombres).join(', ')}
                </span>
              </div>
              <div className="flex justify-between border-b border-border-soft pb-2">
                <span className="text-sm text-text-secondary">Programa / Horario</span>
                <span className="text-sm font-medium text-text-primary">{formData.students[0].programa} - {formData.students[0].nivel} ({formData.students[0].horario || 'Sin horario'})</span>
              </div>
              <div className="flex justify-between border-b border-border-soft pb-2">
                <span className="text-sm text-text-secondary">Inicio</span>
                <span className="text-sm font-medium text-text-primary">{formData.students[0].fechaInicio || '-'}</span>
              </div>
              <div className="flex justify-between border-b border-border-soft pb-2">
                <span className="text-sm text-text-secondary">Plan</span>
                <span className="text-sm font-medium text-text-primary">{formData.plan.tipo === 'contado' ? 'Contado' : `${formData.plan.cuotas} Cuotas`} (S/ {formData.plan.total})</span>
              </div>
              <div className="flex justify-between pt-2">
                <div className="flex flex-col">
                  <span className="text-sm font-medium text-text-primary">Total a Pagar Hoy</span>
                  <span className="text-[10px] text-text-muted uppercase">{formData.payment.metodo} {formData.payment.operacion ? `- Op: ${formData.payment.operacion}` : ''}</span>
                </div>
                <span className="text-lg font-bold text-success-text">S/ {formData.payment.monto}</span>
              </div>
            </div>
          </div>
        )}
        </div>
      </div>

      {/* Footer Actions */}
      <div className="flex justify-between items-center pl-[8vw] pr-[8vw] py-4 border-t border-border-soft shrink-0 bg-surface">
        <Button variant="ghost" onClick={handleCancelClick}>Cancelar</Button>
        <div className="flex gap-3">
          {step > 1 && <Button variant="secondary" onClick={prevStep}>Atrás</Button>}
          {step < totalSteps ? (
            <Button variant="primary" onClick={nextStep}>Siguiente</Button>
          ) : (
            <Button variant="primary" onClick={handleConfirm}>Confirmar Matrícula</Button>
          )}
        </div>
      </div>

      {/* Cancel Confirmation Modal */}
      {showCancelConfirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in">
          <div className="bg-surface rounded-xl shadow-xl w-full max-w-md mx-4 overflow-hidden animate-in zoom-in-95">
            <div className="p-6">
              <h3 className="text-xl font-bold text-text-primary mb-2">¿Guardar progreso?</h3>
              <p className="text-text-secondary mb-6">
                Has avanzado en el registro de la matrícula. ¿Deseas guardar tu progreso para continuar más tarde o prefieres descartarlo y empezar de cero la próxima vez?
              </p>
              <div className="flex flex-col gap-3">
                <Button 
                  variant="primary" 
                  className="w-full justify-center"
                  onClick={() => {
                    localStorage.setItem('enrollmentDraftStep', step.toString());
                    localStorage.setItem('enrollmentDraftData', JSON.stringify(formData));
                    setShowCancelConfirm(false);
                    onClose();
                  }}
                >
                  Sí, guardar y salir
                </Button>
                <Button 
                  variant="secondary" 
                  className="w-full justify-center border-danger-text text-danger-text hover:bg-danger-tint"
                  onClick={() => {
                    localStorage.removeItem('enrollmentDraftStep');
                    localStorage.removeItem('enrollmentDraftData');
                    setShowCancelConfirm(false);
                    onClose();
                  }}
                >
                  No, descartar y salir
                </Button>
                <Button 
                  variant="ghost" 
                  className="w-full justify-center"
                  onClick={() => setShowCancelConfirm(false)}
                >
                  Cancelar y seguir editando
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
