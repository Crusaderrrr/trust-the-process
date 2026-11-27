import { expect, test } from 'vitest';
import { equipmentInfo, muscleGroupImage, muscleInfo } from './catalog';

test('names and pictures for muscles', () => {
  expect(muscleInfo('latissimus_dorsi')).toEqual({
    name: 'Lats',
    latin: 'Latissimus Dorsi',
    image: '/api/catalog/images/muscle-latissimus-dorsi.webp',
  });
  expect(muscleInfo('supraspinatus').image).toBeNull();
  expect(muscleInfo('new_muscle')).toEqual({ name: 'New Muscle', latin: '', image: null });
});

test('names and pictures for equipment', () => {
  expect(equipmentInfo('cable')).toEqual({ name: 'Cable Machine', image: '/api/catalog/images/equipment-cable.webp' });
  expect(equipmentInfo('flat_bench').name).toBe('Flat Bench');
});

test('one picture per muscle group, none for whole-body ones', () => {
  expect(muscleGroupImage('legs')).toBe('/api/catalog/images/muscle-quadriceps.webp');
  expect(muscleGroupImage('cardio')).toBeNull();
});
