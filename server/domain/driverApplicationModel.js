export const DRIVER_APPLICATION_STATUS = Object.freeze({
  DRAFT: 'draft',
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  NEEDS_CHANGES: 'needs_changes',
  SUSPENDED: 'suspended'
});

export const DRIVER_DOCUMENT_TYPES = Object.freeze([
  'identity_front',
  'identity_back',
  'driver_license',
  'vehicle_registration',
  'vehicle_insurance',
  'vehicle_photo',
  'plate_photo',
  'driver_selfie'
]);

export const REQUIRED_DRIVER_DOCUMENTS = Object.freeze([
  'identity_front',
  'identity_back',
  'driver_license',
  'vehicle_registration',
  'vehicle_photo',
  'plate_photo',
  'driver_selfie'
]);

const text = (value, max = 160) => String(value ?? '')
  .replace(/[\u0000-\u001f\u007f]/g, ' ')
  .replace(/[<>&"']/g, '')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, max);

export function normalizeDriverApplicationInput(input = {}) {
  return {
    personal: {
      firstName: text(input.firstName, 80),
      lastName: text(input.lastName, 80),
      identityNumber: text(input.identityNumber, 40).toUpperCase(),
      birthDate: text(input.birthDate, 10),
      phone: text(input.phone, 30),
      email: text(input.email, 180).toLowerCase(),
      address: text(input.address, 240),
      city: text(input.city, 100),
      region: text(input.region, 100)
    },
    vehicle: {
      type: text(input.vehicleType, 20).toUpperCase() === 'CAR' ? 'CAR' : 'MOTO',
      brand: text(input.vehicleBrand, 80),
      model: text(input.vehicleModel, 80),
      year: Number(input.vehicleYear),
      color: text(input.vehicleColor, 50),
      plate: text(input.vehiclePlate, 20).replace(/\s+/g, '').toUpperCase(),
      additionalInfo: text(input.vehicleAdditionalInfo, 300)
    }
  };
}

export function validateDriverApplicationInput(input = {}, { requirePassword = true } = {}) {
  const normalized = normalizeDriverApplicationInput(input);
  const errors = {};
  const { personal, vehicle } = normalized;
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const phoneDigits = personal.phone.replace(/\D/g, '');
  const identityPattern = /^[VEJPG]?[- ]?\d{5,12}$/i;
  const birth = new Date(`${personal.birthDate}T00:00:00Z`);
  const age = Number.isNaN(birth.getTime()) ? -1 : Math.floor((Date.now() - birth.getTime()) / 31557600000);
  const maxVehicleYear = new Date().getFullYear() + 1;

  if (personal.firstName.length < 2) errors.firstName = 'El nombre es obligatorio.';
  if (personal.lastName.length < 2) errors.lastName = 'El apellido es obligatorio.';
  if (!identityPattern.test(personal.identityNumber)) errors.identityNumber = 'Introduce una cédula válida.';
  if (age < 18 || age > 80) errors.birthDate = 'El conductor debe ser mayor de edad.';
  if (phoneDigits.length < 10 || phoneDigits.length > 15) errors.phone = 'Introduce un teléfono válido.';
  if (!emailPattern.test(personal.email)) errors.email = 'Introduce una dirección de correo válida.';
  if (personal.address.length < 8) errors.address = 'La dirección es obligatoria.';
  if (personal.city.length < 2) errors.city = 'La ciudad es obligatoria.';
  if (personal.region.length < 2) errors.region = 'El estado o región es obligatorio.';
  if (vehicle.brand.length < 2) errors.vehicleBrand = 'La marca es obligatoria.';
  if (vehicle.model.length < 1) errors.vehicleModel = 'El modelo es obligatorio.';
  if (!Number.isInteger(vehicle.year) || vehicle.year < 1980 || vehicle.year > maxVehicleYear) errors.vehicleYear = 'Introduce un año válido.';
  if (vehicle.color.length < 2) errors.vehicleColor = 'El color es obligatorio.';
  if (!/^[A-Z0-9-]{4,12}$/.test(vehicle.plate)) errors.vehiclePlate = 'La placa es obligatoria y debe ser válida.';
  if (requirePassword && String(input.password || '').length < 8) errors.password = 'La contraseña debe tener al menos 8 caracteres.';

  return { valid: Object.keys(errors).length === 0, errors, normalized };
}

export function missingRequiredDocuments(documents = []) {
  const submittedTypes = new Set(documents.map(document => document.type));
  return REQUIRED_DRIVER_DOCUMENTS.filter(type => !submittedTypes.has(type));
}
