/* Move complete vehicle assemblies inside the existing GLB scene. */
if (window.AFRAME) {
  AFRAME.registerComponent('street-traffic', {
    schema: {speed: {type: 'number', default: 1}},
    init() {
      this.running = false;
      this.cars = [];
      this.mesh = null;
      this.build = () => {
        const mesh = this.el.getObject3D('mesh');
        if (!mesh || (this.mesh === mesh && this.cars.length)) return;
        this.mesh = mesh;
        this.cars = [];
        const THREE = AFRAME.THREE;
        const nameOf = object => object.name.replace(/[_\s]+/g, ' ').trim();
        let road;
        mesh.traverse(object => { if (nameOf(object) === 'Street asphalt') road = object; });
        const roadBounds = road ? new THREE.Box3().setFromObject(road.clone(true)) : null;
        const roadMin = roadBounds?.min.x ?? -77;
        const roadMax = roadBounds?.max.x ?? 77;
        const specs = [
          {name: 'Red sedan', direction: -1, metresPerSecond: 5},
          {name: 'Jade sedan', direction: -1, metresPerSecond: 3.8},
          {name: 'Ivory sedan', direction: 1, metresPerSecond: 4.5}
        ];
        for (const spec of specs) {
          const belongs = object => nameOf(object).startsWith(spec.name + ' ');
          const parts = [];
          mesh.traverse(object => {
            if (!belongs(object)) return;
            // Select the highest matching object, keeping nested meshes together.
            for (let parent = object.parent; parent && parent !== mesh; parent = parent.parent) {
              if (belongs(parent)) return;
            }
            parts.push(object);
          });
          if (!parts.length) continue;
          // Isolate copies to measure source-space dimensions, independent of AR pose.
          const probe = new THREE.Group();
          for (const part of parts) probe.add(part.clone(true));
          probe.updateMatrixWorld(true);
          const bounds = new THREE.Box3().setFromObject(probe);
          const center = bounds.getCenter(new THREE.Vector3());
          const halfLength = (bounds.max.x - bounds.min.x) / 2;
          const group = new THREE.Group();
          group.name = 'Traffic_' + spec.name.replace(/ /g, '_');
          mesh.add(group);
          // All generated vehicle parts share the model root; reparenting preserves
          // their existing geometry and local transforms without moving the building.
          for (const part of parts) group.add(part);
          this.cars.push({
            ...spec, group, initialX: center.x, x: center.x, halfLength,
            visibleMin: roadMin + halfLength + .4,
            visibleMax: roadMax - halfLength - .4,
            routeMin: roadMin - halfLength - 1,
            routeMax: roadMax + halfLength + 1
          });
        }
        this.el.emit('traffic-ready', {vehicles: this.cars.length});
        if (this.cars.length !== 3) console.warn('Expected three traffic vehicles; found', this.cars.length);
      };
      this.el.addEventListener('model-loaded', this.build);
      if (this.el.getObject3D('mesh')) this.build();
    },
    setRunning(value) { this.running = Boolean(value); },
    tick(time, delta) {
      if (!this.running || document.hidden || !Number.isFinite(delta) || delta <= 0) return;
      // A suspended browser tab or brief loss of tracking must not teleport a car.
      const dt = Math.min(delta, 250) / 1000;
      const multiplier = Math.max(0, Number(this.data.speed) || 0);
      for (const car of this.cars) {
        const span = car.routeMax - car.routeMin;
        car.x += car.direction * car.metresPerSecond * multiplier * dt;
        car.x = car.routeMin + ((car.x - car.routeMin) % span + span) % span;
        car.group.position.x = car.x - car.initialX;
        // The road ends conceal the loop; vehicles never drive outside the diorama.
        car.group.visible = car.x >= car.visibleMin && car.x <= car.visibleMax;
      }
    },
    remove() {
      this.el.removeEventListener('model-loaded', this.build);
      this.running = false;
      for (const car of this.cars) {
        for (const part of [...car.group.children]) this.mesh.add(part);
        this.mesh.remove(car.group);
      }
      this.cars = [];
    }
  });
}
