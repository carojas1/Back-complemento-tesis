import { Injectable } from '@nestjs/common';
import { createPublicKey, KeyObject, verify } from 'node:crypto';
import { SignatureVerifier } from '../../domain/ports/devices.repository';

// ECDSA P-256 with SHA-256 and DER signature: what Android Keystore's `SHA256withECDSA` produces.
@Injectable()
export class EcdsaSignatureVerifier extends SignatureVerifier {
  isValidPublicKey(publicKey: string) {
    return toKey(publicKey) !== null;
  }

  verify(publicKey: string, message: string, signature: string) {
    const key = toKey(publicKey);
    if (!key) return false;
    try {
      return verify('sha256', Buffer.from(message), key, Buffer.from(signature, 'base64'));
    } catch {
      return false;
    }
  }
}

function toKey(publicKey: string): KeyObject | null {
  try {
    const key = createPublicKey({ key: Buffer.from(publicKey, 'base64'), format: 'der', type: 'spki' });
    return key.asymmetricKeyType === 'ec' && key.asymmetricKeyDetails?.namedCurve === 'prime256v1' ? key : null;
  } catch {
    return null;
  }
}
