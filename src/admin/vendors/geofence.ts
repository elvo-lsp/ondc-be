import { BadRequestException } from '@nestjs/common';

/** Typical single-storefront geofence radius; wide enough to absorb GPS drift. */
export const DEFAULT_GEOFENCE_RADIUS_METERS = 150;

interface GeofenceFields {
  latitude: number | null;
  longitude: number | null;
  geofenceRadiusMeters: number | null;
}

interface GeofenceInput {
  latitude?: number;
  longitude?: number;
  geofenceRadiusMeters?: number;
}

/**
 * Merges a partial update onto the vendor's current geofence and returns the
 * columns to write, or throws if the result would be inconsistent.
 *
 * Latitude and longitude must end up both-set or both-null - a radius means
 * nothing without a location, and a location with no radius silently defaults
 * rather than requiring the admin to type "150" on every vendor.
 */
export function resolveGeofenceFields(
  current: GeofenceFields,
  dto: GeofenceInput,
): GeofenceFields {
  const latitude = dto.latitude ?? current.latitude;
  const longitude = dto.longitude ?? current.longitude;

  if ((latitude === null) !== (longitude === null)) {
    throw new BadRequestException(
      'latitude and longitude must be provided together',
    );
  }

  if (latitude === null || longitude === null) {
    if (dto.geofenceRadiusMeters !== undefined) {
      throw new BadRequestException(
        'A location is required to set a check-in radius',
      );
    }
    return { latitude: null, longitude: null, geofenceRadiusMeters: null };
  }

  return {
    latitude,
    longitude,
    geofenceRadiusMeters:
      dto.geofenceRadiusMeters ??
      current.geofenceRadiusMeters ??
      DEFAULT_GEOFENCE_RADIUS_METERS,
  };
}
