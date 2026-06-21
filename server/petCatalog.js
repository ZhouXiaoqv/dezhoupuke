const PET_CATALOG = [
  { id: 'beaver', name: 'Beaver', modelUrl: 'assets/pets/models/animal-beaver.glb', previewUrl: 'assets/pets/previews/animal-beaver.png' },
  { id: 'bee', name: 'Bee', modelUrl: 'assets/pets/models/animal-bee.glb', previewUrl: 'assets/pets/previews/animal-bee.png' },
  { id: 'bunny', name: 'Bunny', modelUrl: 'assets/pets/models/animal-bunny.glb', previewUrl: 'assets/pets/previews/animal-bunny.png' },
  { id: 'cat', name: 'Cat', modelUrl: 'assets/pets/models/animal-cat.glb', previewUrl: 'assets/pets/previews/animal-cat.png' },
  { id: 'caterpillar', name: 'Caterpillar', modelUrl: 'assets/pets/models/animal-caterpillar.glb', previewUrl: 'assets/pets/previews/animal-caterpillar.png' },
  { id: 'chick', name: 'Chick', modelUrl: 'assets/pets/models/animal-chick.glb', previewUrl: 'assets/pets/previews/animal-chick.png' },
  { id: 'cow', name: 'Cow', modelUrl: 'assets/pets/models/animal-cow.glb', previewUrl: 'assets/pets/previews/animal-cow.png' },
  { id: 'crab', name: 'Crab', modelUrl: 'assets/pets/models/animal-crab.glb', previewUrl: 'assets/pets/previews/animal-crab.png' },
  { id: 'deer', name: 'Deer', modelUrl: 'assets/pets/models/animal-deer.glb', previewUrl: 'assets/pets/previews/animal-deer.png' },
  { id: 'dog', name: 'Dog', modelUrl: 'assets/pets/models/animal-dog.glb', previewUrl: 'assets/pets/previews/animal-dog.png' },
  { id: 'elephant', name: 'Elephant', modelUrl: 'assets/pets/models/animal-elephant.glb', previewUrl: 'assets/pets/previews/animal-elephant.png' },
  { id: 'fish', name: 'Fish', modelUrl: 'assets/pets/models/animal-fish.glb', previewUrl: 'assets/pets/previews/animal-fish.png' },
  { id: 'fox', name: 'Fox', modelUrl: 'assets/pets/models/animal-fox.glb', previewUrl: 'assets/pets/previews/animal-fox.png' },
  { id: 'giraffe', name: 'Giraffe', modelUrl: 'assets/pets/models/animal-giraffe.glb', previewUrl: 'assets/pets/previews/animal-giraffe.png' },
  { id: 'hog', name: 'Hog', modelUrl: 'assets/pets/models/animal-hog.glb', previewUrl: 'assets/pets/previews/animal-hog.png' },
  { id: 'koala', name: 'Koala', modelUrl: 'assets/pets/models/animal-koala.glb', previewUrl: 'assets/pets/previews/animal-koala.png' },
  { id: 'lion', name: 'Lion', modelUrl: 'assets/pets/models/animal-lion.glb', previewUrl: 'assets/pets/previews/animal-lion.png' },
  { id: 'monkey', name: 'Monkey', modelUrl: 'assets/pets/models/animal-monkey.glb', previewUrl: 'assets/pets/previews/animal-monkey.png' },
  { id: 'panda', name: 'Panda', modelUrl: 'assets/pets/models/animal-panda.glb', previewUrl: 'assets/pets/previews/animal-panda.png' },
  { id: 'parrot', name: 'Parrot', modelUrl: 'assets/pets/models/animal-parrot.glb', previewUrl: 'assets/pets/previews/animal-parrot.png' },
  { id: 'penguin', name: 'Penguin', modelUrl: 'assets/pets/models/animal-penguin.glb', previewUrl: 'assets/pets/previews/animal-penguin.png' },
  { id: 'pig', name: 'Pig', modelUrl: 'assets/pets/models/animal-pig.glb', previewUrl: 'assets/pets/previews/animal-pig.png' },
  { id: 'polar', name: 'Polar', modelUrl: 'assets/pets/models/animal-polar.glb', previewUrl: 'assets/pets/previews/animal-polar.png' },
  { id: 'tiger', name: 'Tiger', modelUrl: 'assets/pets/models/animal-tiger.glb', previewUrl: 'assets/pets/previews/animal-tiger.png' },
];

const PET_IDS = new Set(PET_CATALOG.map((pet) => pet.id));

module.exports = {
  PET_CATALOG,
  PET_IDS,
};
