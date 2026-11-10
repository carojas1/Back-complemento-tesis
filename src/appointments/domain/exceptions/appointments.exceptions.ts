import { DomainException } from '../../../common/exceptions/base.exception';

export class AppointmentNotFound extends DomainException {
  constructor() {
    super('NOT_FOUND', 'AppointmentNotFound', 'No existe esa cita');
  }
}

export class InvalidAppointmentPeriod extends DomainException {
  constructor() {
    super('INVALID', 'InvalidAppointmentPeriod', 'Una cita dura entre 10 minutos y 8 horas y termina después de empezar');
  }
}

export class AppointmentClosed extends DomainException {
  constructor() {
    super('CONFLICT', 'AppointmentClosed', 'Esta cita ya se cerró; agende una nueva');
  }
}

export class TherapistUnavailable extends DomainException {
  constructor() {
    super('CONFLICT', 'TherapistUnavailable', 'El especialista ya tiene una cita a esa hora');
  }
}

export class PatientUnavailable extends DomainException {
  constructor() {
    super('CONFLICT', 'PatientUnavailable', 'El paciente ya tiene una cita a esa hora');
  }
}

export class RoomUnavailable extends DomainException {
  constructor() {
    super('CONFLICT', 'RoomUnavailable', 'Ese consultorio ya está ocupado a esa hora');
  }
}

export class RoomNotBookable extends DomainException {
  constructor() {
    super('INVALID', 'RoomNotBookable', 'Elija un consultorio activo de este centro');
  }
}

// A day that already ended is a record: nothing new is booked on it and nothing is moved to it.
export class AppointmentInThePast extends DomainException {
  constructor() {
    super('INVALID', 'AppointmentInThePast', 'Ese día ya pasó; elija hoy o una fecha futura');
  }
}

export class OutsideCenterHours extends DomainException {
  constructor() {
    super('INVALID', 'OutsideCenterHours', 'El centro está cerrado a esa hora; revise el horario de atención');
  }
}

export class NotAnActiveTherapist extends DomainException {
  constructor() {
    super('INVALID', 'NotAnActiveTherapist', 'Elija un especialista activo de este centro');
  }
}

export class PatientNotBookable extends DomainException {
  constructor() {
    super('INVALID', 'PatientNotBookable', 'El paciente no existe o fue dado de alta');
  }
}

// The agenda follows the assignment of spec 102: the admin assigns the patient to the specialist first.
export class PatientNotAssignedToTherapist extends DomainException {
  constructor() {
    super('INVALID', 'PatientNotAssignedToTherapist', 'Asigne primero el paciente a este especialista');
  }
}

// A specialist only books, moves and closes their own appointments.
export class NotYourAppointment extends DomainException {
  constructor() {
    super('FORBIDDEN', 'NotYourAppointment', 'Esta cita es de otro especialista');
  }
}
