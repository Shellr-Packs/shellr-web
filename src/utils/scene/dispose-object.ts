import { Material, Mesh, Object3D, Texture } from "three";

const disposeMaterial = (material: Material): void => {
  // Every texture a material holds is a GPU allocation; the material itself
  // never frees them.
  for (const value of Object.values(material)) {
    if (value instanceof Texture) value.dispose();
  }
  material.dispose();
};

/**
 * Release every geometry, material and texture under `root`.
 *
 * three.js keeps GPU resources alive after an object leaves the scene graph, so
 * an unmounted scene leaks without this.
 */
export const disposeObject = (root: Object3D): void => {
  root.traverse((child) => {
    if (!(child instanceof Mesh)) return;

    child.geometry?.dispose();

    if (Array.isArray(child.material)) {
      child.material.forEach(disposeMaterial);
      return;
    }
    if (child.material) disposeMaterial(child.material);
  });
};
