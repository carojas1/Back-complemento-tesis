import { Injectable } from '@nestjs/common';
import type { Content } from 'pdfmake/interfaces';
import { barChart, dataTable, isoDay, renderPdf } from '../../../common/pdf/pdf';
import { centerOffsetMs } from '../../../common/time/center-time';
import { ReportDocumentData, ReportRenderer } from '../../domain/ports/sessions.read-model';

const goalStatus: Record<string, string> = { IN_PROGRESS: 'En curso', ACHIEVED: 'Logrado', SUSPENDED: 'Suspendido' };
const appointmentStatus: Record<string, string> = {
  SCHEDULED: 'Agendada',
  COMPLETED: 'Asistió',
  CANCELED: 'Cancelada',
  NO_SHOW: 'No asistió',
};
const sessionKind: Record<string, string> = { THERAPY: 'En terapia', HOME: 'En casa' };
// In the center's own time: a clinical record is read by date and hour of the appointment.
const stamp = (date: Date) => new Date(date.getTime() - centerOffsetMs).toISOString().slice(0, 16).replace('T', ' ');

// Spec 107 T007 and 108 T005: Center header, patient, period, indicators, charts, and observations and objectives.
@Injectable()
export class PdfmakeReportRenderer extends ReportRenderer {
  render({ centerName, patient, period, report }: ReportDocumentData) {
    const empty = report.sessions === 0;
    const content: Content[] = [
      { text: centerName, style: 'title' },
      { text: 'Historial clínico', fontSize: 13, bold: true },
      {
        text: `Paciente ${patient.code} · ${patient.firstNames} ${patient.lastNames} · Periodo ${isoDay(period.from)} a ${isoDay(period.to)}`,
        style: 'subtitle',
      },
      ...(report.staleDevices > 0
        ? [
            {
              text: `Aviso: ${report.staleDevices} tableta(s) sin sincronizar hace más de 24 h; el reporte puede estar incompleto.`,
              color: '#A15C00',
              margin: [0, 0, 0, 8],
            } as Content,
          ]
        : []),
      { text: 'Indicadores', style: 'section' },
      empty
        ? { text: 'No hay sesiones en el periodo. Pruebe con un rango más amplio.', italics: true }
        : dataTable(
            ['Sesiones', 'Minutos', 'Palabras distintas'],
            [[String(report.sessions), String(report.minutes), String(report.distinctWords)]],
          ),
      { text: 'Avance del tratamiento', style: 'section' },
      dataTable(
        ['Sesiones prescritas', 'Asistidas', 'Agendadas', 'No asistió'],
        [
          [
            patient.prescribedSessions === null ? '—' : String(patient.prescribedSessions),
            String(patient.appointments.filter((a) => a.status === 'COMPLETED').length),
            String(patient.appointments.filter((a) => a.status === 'SCHEDULED').length),
            String(patient.appointments.filter((a) => a.status === 'NO_SHOW').length),
          ],
        ],
      ),
      { text: 'Minutos de práctica por semana', style: 'section' },
      report.practiceByWeek.length
        ? barChart(
            report.practiceByWeek.map((w) => ({
              label: `Semana ${w.week}`,
              value: w.therapyMinutes + w.homeMinutes,
              text: `${w.therapyMinutes} en terapia · ${w.homeMinutes} en casa`,
            })),
            { color: '#0F8A85' },
          )
        : { text: 'Sin práctica registrada en el periodo.', style: 'muted' },
      { text: 'Longitud media de frase por semana', style: 'section' },
      report.weeks.some((w) => w.meanSentenceLength !== null)
        ? barChart(
            report.weeks.map((w) => ({ label: `Semana ${w.week}`, value: w.meanSentenceLength })),
            { color: '#2E6FBF' },
          )
        : { text: 'Sin frases en el periodo.', style: 'muted' },
      { text: 'Aciertos al primer intento por semana (%)', style: 'section' },
      report.weeks.some((w) => w.accuracy !== null)
        ? barChart(
            report.weeks.map((w) => ({
              label: `Semana ${w.week}`,
              value: w.accuracy,
              text: w.accuracy === null ? '—' : `${w.accuracy} %`,
            })),
            { color: '#2E8B57', max: 100 },
          )
        : { text: 'Sin actividades en el periodo.', style: 'muted' },
      { text: 'Las 10 palabras más usadas', style: 'section' },
      report.topWords.length
        ? barChart(
            report.topWords.map((w) => ({ label: w.word, value: w.count })),
            { color: '#8A5CC2' },
          )
        : { text: 'Sin pictogramas tocados en el periodo.', style: 'muted' },
      { text: 'Citas del periodo', style: 'section' },
      patient.appointments.length
        ? dataTable(
            ['Fecha y hora (Ecuador)', 'Profesional', 'Consultorio', 'Estado'],
            patient.appointments.map((a) => [
              stamp(a.startsAt),
              a.therapistName,
              a.roomName ?? '—',
              appointmentStatus[a.status] ?? a.status,
            ]),
            [95, '*', 80, 70],
          )
        : { text: 'Sin citas en el periodo.', style: 'muted' },
      { text: 'Sesiones registradas por la tableta', style: 'section' },
      patient.sessions.length
        ? dataTable(
            ['Inicio (Ecuador)', 'Tipo', 'Minutos', 'Profesional'],
            patient.sessions.map((s) => [stamp(s.startedAt), sessionKind[s.kind] ?? s.kind, String(s.minutes), s.therapistName ?? '—']),
            [95, 70, 50, '*'],
          )
        : { text: 'Sin sesiones en el periodo.', style: 'muted' },
      { text: 'Observaciones del periodo', style: 'section' },
      patient.notes.length
        ? dataTable(
            ['Fecha (hora de Ecuador)', 'Especialista', 'Observación'],
            patient.notes.map((n) => [stamp(n.createdAt), n.authorName, n.text]),
            [95, 80, '*'],
          )
        : { text: 'Sin observaciones en el periodo.', style: 'muted' },
      { text: 'Objetivos', style: 'section' },
      patient.goals.length
        ? dataTable(
            ['Objetivo', 'Estado', 'Fecha meta'],
            patient.goals.map((g) => [g.text, goalStatus[g.status] ?? g.status, g.targetDate ? isoDay(g.targetDate) : '—']),
            ['*', 70, 70],
          )
        : { text: 'Sin objetivos.', style: 'muted' },
      {
        text: `Generado el ${stamp(new Date())}, hora de Ecuador. Indicadores calculados desde los eventos registrados por las tabletas.`,
        style: 'muted',
        margin: [0, 16, 0, 0],
      },
    ];
    return renderPdf({ info: { title: `Historial clínico ${patient.code}` }, content });
  }
}
