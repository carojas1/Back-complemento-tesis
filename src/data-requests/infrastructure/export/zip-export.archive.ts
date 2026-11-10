import { Injectable } from '@nestjs/common';
import JSZip from 'jszip';
import { csvCell } from '../../../common/csv/csv-cell';
import { dataTable, isoDay, renderPdf } from '../../../common/pdf/pdf';
import { ExportArchive, PatientExport } from '../../domain/ports/data-requests.repository';

// UTF-8 with BOM, like the audit CSV: Excel opens the accents correctly.
const csv = (header: string[], rows: unknown[][]) => '﻿' + [header.join(','), ...rows.map((r) => r.map(csvCell).join(','))].join('\n');
const yesNo = (value: boolean) => (value ? 'sí' : 'no');

// Spec 110 T003: what the guardian receives when requesting access to the data.
@Injectable()
export class ZipExportArchive extends ExportArchive {
  async build({ centerName, data, reportPdf }: { centerName: string; data: PatientExport; reportPdf: Buffer }) {
    const files: Record<string, Buffer | string> = {
      'ficha.pdf': await this.recordPdf(centerName, data.patient),
      'reporte.pdf': reportPdf,
      'observaciones.csv': csv(
        ['fecha', 'editada', 'terapeuta', 'sesion', 'texto'],
        data.notes.map((n) => [n.createdAt, n.editedAt, n.authorName, n.sessionId, n.text]),
      ),
      'objetivos.csv': csv(
        ['creado', 'actualizado', 'terapeuta', 'objetivo', 'estado', 'fecha_meta'],
        data.goals.map((g) => [g.createdAt, g.updatedAt, g.authorName, g.text, g.status, g.targetDate ? isoDay(g.targetDate) : '']),
      ),
      'sesiones.csv': csv(
        ['sesion', 'tipo', 'inicio', 'fin', 'tableta', 'terapeuta', 'representante'],
        data.sessions.map((s) => [
          s.id,
          s.kind === 'HOME' ? 'casa' : 'terapia',
          s.startedAt,
          s.endedAt,
          s.deviceName,
          s.therapistName,
          s.guardianName,
        ]),
      ),
      'deberes.csv': csv(
        ['creado', 'terapeuta', 'instruccion', 'fecha_limite', 'pictogramas', 'actividad', 'hecho'],
        data.homework.map((h) => [
          h.createdAt,
          h.authorName,
          h.instructions,
          h.dueDate ? isoDay(h.dueDate) : '',
          h.pictograms.join(' · '),
          yesNo(h.withActivity),
          h.completedAt,
        ]),
      ),
      'eventos.csv': csv(
        ['sesion', 'fecha', 'tipo', 'palabra', 'datos'],
        data.events.map((e) => [e.sessionId, e.occurredAt, e.type, (e.payload as { word?: string } | null)?.word ?? '', e.payload]),
      ),
      'actividades.csv': csv(
        ['sesion', 'actividad', 'fecha', 'pedida', 'elegida', 'correcta', 'primer_intento', 'ms'],
        data.results.map((r) => [
          r.sessionId,
          r.activityType,
          r.answeredAt,
          r.target,
          r.chosen,
          yesNo(r.correct),
          yesNo(r.firstAttempt),
          r.responseMs,
        ]),
      ),
    };
    const zip = new JSZip();
    for (const [name, content] of Object.entries(files)) zip.file(name, content);
    return { zip: await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }), files: Object.keys(files) };
  }

  // Patient record: everything the platform stores about them (the consent photo is not included).
  private recordPdf(centerName: string, p: PatientExport['patient']) {
    const rows: [string, string][] = [
      ['Código', p.code],
      ['Nombres', p.firstNames],
      ['Apellidos', p.lastNames],
      ['Fecha de nacimiento', isoDay(p.birthDate)],
      ['Representante legal', p.guardianName],
      ['Teléfono del representante', p.guardianPhone],
      ['Fecha del consentimiento', isoDay(p.consentDate)],
      ['Estado', p.status === 'ACTIVE' ? 'Activo' : `Dado de alta${p.dischargedAt ? ` el ${isoDay(p.dischargedAt)}` : ''}`],
      ['Registrado', isoDay(p.createdAt)],
      ['Avatar', p.avatar],
      ['Diagnóstico', p.diagnosis ?? '—'],
      ['Condiciones asociadas', p.conditions.join(', ') || '—'],
      ['Terapeutas asignadas', p.therapists.join(', ') || '—'],
    ];
    const profile = p.profile
      ? [
          ['Cuadrícula', String(p.profile.gridSize)],
          ['Nivel de actividades', String(p.profile.activityLevel)],
          ['Velocidad de voz', String(p.profile.speechRate)],
          ['Barra de frase', yesNo(p.profile.sentenceBarEnabled)],
          ['Voz del tablero', p.profile.voice === 'CLONED' ? 'Clonada' : 'Del sistema'],
        ]
      : [];
    const voice = p.voice
      ? [
          ['Voz clonada de', `${p.voice.ownerName} (${p.voice.relationship})`],
          ['Consentimiento de la voz', isoDay(p.voice.consentDate)],
          ['Estado de la voz', p.voice.status],
        ]
      : [];
    return renderPdf({
      info: { title: `Ficha ${p.code}` },
      content: [
        { text: centerName, style: 'title' },
        { text: 'Ficha del paciente', fontSize: 13, bold: true },
        { text: `Copia de los datos personales (LOPDP, derecho de acceso). Generada el ${isoDay(new Date())}.`, style: 'subtitle' },
        dataTable(['Dato', 'Valor'], rows, [150, '*']),
        ...(profile.length
          ? [{ text: 'Perfil de comunicación', style: 'section' }, dataTable(['Ajuste', 'Valor'], profile, [150, '*'])]
          : []),
        ...(voice.length ? [{ text: 'Voz clonada', style: 'section' }, dataTable(['Dato', 'Valor'], voice, [150, '*'])] : []),
      ],
    });
  }
}
