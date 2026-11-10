import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, Transporter } from 'nodemailer';
import { AuthMailer } from '../../domain/ports/auth-notifications.ports';

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

// E-mail through the institutional SMTP. Without SMTP_HOST (development only) it is written
// to the log so the links can be tested.
// ponytail: the API's only sender; if another module needs e-mail, extract the transport to src/mail.
@Injectable()
export class NodemailerAuthMailer extends AuthMailer {
  private readonly logger = new Logger(NodemailerAuthMailer.name);
  private readonly transporter: Transporter | null;
  private readonly from: string;
  private readonly webUrl: string;

  constructor(config: ConfigService) {
    super();
    const host = config.get<string>('SMTP_HOST');
    if (!host && config.get('NODE_ENV') === 'production') {
      throw new Error('SMTP_HOST is required in production');
    }
    const port = Number(config.get('SMTP_PORT', 587));
    this.transporter = host
      ? createTransport({
          host,
          port,
          secure: port === 465,
          // A blocked SMTP port must fail fast: the tablet gives up on a request after 15 s.
          connectionTimeout: 5_000,
          greetingTimeout: 5_000,
          socketTimeout: 10_000,
          auth: config.get('SMTP_USER') ? { user: config.get('SMTP_USER'), pass: config.get('SMTP_PASS') } : undefined,
        })
      : null;
    this.from = config.get<string>('MAIL_FROM', 'Necon <no-reply@localhost>');
    this.webUrl = config.getOrThrow<string>('WEB_URL').replace(/\/$/, '');
  }

  async sendInstitutionWelcome(to: { email: string; name: string }, institution: string, temporaryPassword: string) {
    const subject = `Necon: la cuenta de ${institution} está lista`;
    const text =
      `Hola ${to.name}:\n\nAprobamos la solicitud de ${institution}. Entre a la app Necon con «Iniciar sesión»:\n` +
      `Correo: ${to.email}\nClave temporal: ${temporaryPassword}\n\nAl entrar le pedirá una contraseña nueva.`;
    await this.send(to.email, subject, text, `<p>${escapeHtml(text).replace(/\n/g, '<br>')}</p>`);
  }

  async sendRequestReceived(to: { email: string; name: string }, institution: string) {
    const subject = `Necon: recibimos la solicitud de ${institution}`;
    const text =
      `Hola ${to.name}:\n\nRecibimos la solicitud de cuenta de ${institution}. Un administrador de la plataforma se comunicará ` +
      'con usted dentro de 24 horas para completar el perfil del centro.\n\nPor ahora no necesita hacer nada más.';
    await this.send(to.email, subject, text, `<p>${escapeHtml(text).replace(/\n/g, '<br>')}</p>`);
  }

  async sendNewRequestAlert(to: string[], institution: string, requestId: string) {
    const link = `${this.webUrl}/platform/requests/${encodeURIComponent(requestId)}`;
    const subject = `Necon: nueva solicitud de centro (${institution})`;
    const text = `${institution} pidió una cuenta. Comuníquese con el centro dentro de 24 horas:\n${link}`;
    const html = `<p>${escapeHtml(institution)} pidió una cuenta. Comuníquese con el centro dentro de 24 horas.</p><p><a href="${link}">Revisar la solicitud</a></p>`;
    await Promise.all(to.map((email) => this.send(email, subject, text, html)));
  }

  private async send(email: string, subject: string, text: string, html: string) {
    if (!this.transporter) {
      this.logger.warn(`[NO SMTP] To: ${email} | ${subject}`);
      return;
    }
    await this.transporter.sendMail({ from: this.from, to: email, subject, text, html });
  }

  async sendPasswordReset(to: { email: string; name: string }, token: string) {
    const link = `${this.webUrl}/reset-password?token=${encodeURIComponent(token)}`;
    const name = escapeHtml(to.name);
    const subject = 'Necon: restablecer su contraseña';
    const text =
      `Hola ${to.name}:\n\nPara crear una contraseña nueva abra este enlace (válido 30 minutos, un solo uso):\n${link}\n\n` +
      'Si usted no lo pidió, ignore este correo.';

    if (!this.transporter) {
      this.logger.warn(`[NO SMTP] To: ${to.email} | ${subject}`);
      return;
    }
    await this.transporter.sendMail({
      from: this.from,
      to: to.email,
      subject,
      text,
      html:
        `<p>Hola ${name}:</p>` +
        '<p>Para crear una contraseña nueva abra este enlace. Es válido por 30 minutos y de un solo uso.</p>' +
        `<p><a href="${link}">Restablecer contraseña</a></p>` +
        '<p>Si usted no lo pidió, ignore este correo.</p>',
    });
  }
}
