import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";

export default function JervisDragonCore({
  state = "standby",
  volume = 0,
  speakingLevel = 0,
  isWebglAvailable = true
}) {
  const mountRef = useRef(null);
  const stateRef = useRef(state);
  const volumeRef = useRef(volume);
  const speakingRef = useRef(speakingLevel);
  const [webglUnavailable, setWebglUnavailable] = useState(!isWebglAvailable);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    volumeRef.current = volume;
  }, [volume]);

  useEffect(() => {
    speakingRef.current = speakingLevel;
  }, [speakingLevel]);

  useEffect(() => {
    if (!isWebglAvailable) {
      setWebglUnavailable(true);
    }
  }, [isWebglAvailable]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount || !isWebglAvailable) return undefined;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
    camera.position.set(0, 0.24, 5.1);

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({
        alpha: true,
        antialias: true,
        powerPreference: "high-performance"
      });
    } catch {
      setWebglUnavailable(true);
      return undefined;
    }
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    mount.appendChild(renderer.domElement);

    const rootGroup = new THREE.Group();
    const headGroup = new THREE.Group();
    const ringGroup = new THREE.Group();
    const particleGroup = new THREE.Group();
    scene.add(rootGroup);
    rootGroup.add(ringGroup, headGroup, particleGroup);

    const gold = new THREE.Color("#f6be6c");
    const amber = new THREE.Color("#ff8f3f");
    const red = new THREE.Color("#d33128");
    const violet = new THREE.Color("#6c4ff5");
    const cyan = new THREE.Color("#5be7ff");
    const green = new THREE.Color("#8be68b");

    const headMaterial = new THREE.MeshStandardMaterial({
      color: red,
      emissive: red,
      emissiveIntensity: 0.52,
      metalness: 0.72,
      roughness: 0.32,
      flatShading: true
    });
    const snoutMaterial = new THREE.MeshStandardMaterial({
      color: amber,
      emissive: red,
      emissiveIntensity: 0.25,
      metalness: 0.62,
      roughness: 0.34,
      flatShading: true
    });
    const hornMaterial = new THREE.MeshStandardMaterial({
      color: gold,
      emissive: gold,
      emissiveIntensity: 0.34,
      metalness: 0.78,
      roughness: 0.28,
      flatShading: true
    });
    const eyeMaterial = new THREE.MeshBasicMaterial({ color: gold });
    const ringMaterial = new THREE.MeshBasicMaterial({
      color: gold,
      transparent: true,
      opacity: 0.34,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const cyanRingMaterial = ringMaterial.clone();
    cyanRingMaterial.color = cyan;
    cyanRingMaterial.opacity = 0.18;
    const trailMaterial = ringMaterial.clone();
    trailMaterial.color = amber;
    trailMaterial.opacity = 0.46;

    const head = new THREE.Mesh(new THREE.DodecahedronGeometry(0.82, 0), headMaterial);
    head.scale.set(0.9, 1.08, 0.62);
    head.rotation.z = Math.PI / 4;
    headGroup.add(head);

    const browLeft = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.055, 0.075), hornMaterial);
    const browRight = browLeft.clone();
    browLeft.position.set(-0.22, 0.18, 0.46);
    browRight.position.set(0.22, 0.18, 0.46);
    browLeft.rotation.z = -0.24;
    browRight.rotation.z = 0.24;
    headGroup.add(browLeft, browRight);

    const snout = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.82, 4), snoutMaterial);
    snout.position.set(0, -0.44, 0.42);
    snout.rotation.z = Math.PI / 4;
    headGroup.add(snout);

    const hornLeft = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.72, 4), hornMaterial);
    const hornRight = hornLeft.clone();
    hornLeft.position.set(-0.58, 0.72, 0.04);
    hornRight.position.set(0.58, 0.72, 0.04);
    hornLeft.rotation.set(0.22, 0.12, 0.68);
    hornRight.rotation.set(0.22, -0.12, -0.68);
    headGroup.add(hornLeft, hornRight);

    const eyeLeft = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.035, 0.045), eyeMaterial);
    const eyeRight = eyeLeft.clone();
    eyeLeft.position.set(-0.25, 0.05, 0.7);
    eyeRight.position.set(0.25, 0.05, 0.7);
    eyeLeft.rotation.z = 0.14;
    eyeRight.rotation.z = -0.14;
    headGroup.add(eyeLeft, eyeRight);

    const rings = [
      new THREE.Mesh(new THREE.TorusGeometry(1.28, 0.012, 8, 96), ringMaterial),
      new THREE.Mesh(new THREE.TorusGeometry(1.55, 0.009, 8, 96), cyanRingMaterial),
      new THREE.Mesh(new THREE.TorusGeometry(1.86, 0.008, 8, 96), trailMaterial)
    ];
    rings[0].rotation.x = Math.PI / 2.22;
    rings[1].rotation.x = Math.PI / 2.1;
    rings[1].rotation.y = 0.26;
    rings[2].rotation.x = Math.PI / 2.35;
    rings[2].rotation.y = -0.34;
    ringGroup.add(...rings);

    const particleMaterial = new THREE.PointsMaterial({
      color: violet,
      size: 0.028,
      transparent: true,
      opacity: 0.46,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const positions = new Float32Array(84 * 3);
    for (let index = 0; index < positions.length; index += 3) {
      const radius = 1.15 + Math.random() * 1.25;
      const angle = Math.random() * Math.PI * 2;
      positions[index] = Math.cos(angle) * radius;
      positions[index + 1] = -1.45 + Math.random() * 2.9;
      positions[index + 2] = Math.sin(angle) * 0.42;
    }
    const particleGeometry = new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const particles = new THREE.Points(particleGeometry, particleMaterial);
    particleGroup.add(particles);

    const keyLight = new THREE.PointLight(0xf6be6c, 3.2, 9);
    keyLight.position.set(0.8, 1.4, 2.8);
    const rimLight = new THREE.PointLight(0x5be7ff, 1.2, 7);
    rimLight.position.set(-1.8, -0.4, 2.2);
    const violetLight = new THREE.PointLight(0x6c4ff5, 1, 7);
    violetLight.position.set(1.8, -0.7, 2.4);
    scene.add(new THREE.AmbientLight(0xffb06a, 0.42), keyLight, rimLight, violetLight);

    const pointer = { x: 0, y: 0 };
    const onPointerMove = (event) => {
      const rect = mount.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width - 0.5) * 0.42;
      pointer.y = ((event.clientY - rect.top) / rect.height - 0.5) * -0.32;
    };
    const onPointerLeave = () => {
      pointer.x = 0;
      pointer.y = 0;
    };
    mount.addEventListener("pointermove", onPointerMove);
    mount.addEventListener("pointerleave", onPointerLeave);

    const resize = () => {
      const size = Math.max(180, Math.floor(Math.min(mount.clientWidth || 240, mount.clientHeight || 240)));
      renderer.setSize(size, size, false);
      camera.aspect = 1;
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(mount);
    resize();

    let frameId = 0;
    const clock = new THREE.Clock();
    const animate = () => {
      const elapsed = clock.getElapsedTime();
      const currentState = stateRef.current;
      const isExecuting = currentState === "executing";
      const isListening = currentState === "listening";
      const isThinking = currentState === "thinking";
      const isSpeaking = currentState === "speaking";
      const isBlocked = currentState === "blocked";
      const isDone = currentState === "done";
      const reactive = Math.max(volumeRef.current || 0, speakingRef.current || 0);
      const breath = Math.sin(elapsed * 1.25) * 0.055;
      const pulse = reactive * 0.18;

      rootGroup.rotation.y += (pointer.x - rootGroup.rotation.y) * 0.045;
      rootGroup.rotation.x += (pointer.y - rootGroup.rotation.x) * 0.045;
      headGroup.rotation.y = Math.sin(elapsed * 0.55) * 0.12;
      headGroup.position.y = breath;
      headGroup.scale.setScalar(1 + breath * 0.38 + pulse + (isDone ? Math.max(0, 0.12 - (elapsed % 1.1) * 0.08) : 0));

      const activeColor = isListening ? cyan : isThinking ? violet : isBlocked ? red : isSpeaking || isExecuting ? amber : isDone ? green : gold;
      headMaterial.emissive.lerp(activeColor, 0.08);
      snoutMaterial.emissive.lerp(isThinking ? violet : isSpeaking ? amber : red, 0.07);
      eyeMaterial.color.lerp(activeColor, 0.14);
      eyeLeft.scale.y = eyeRight.scale.y = isListening || isExecuting || isBlocked || isSpeaking ? 3.4 : 1;

      ringMaterial.color.lerp(isBlocked ? red : isDone ? green : gold, 0.08);
      cyanRingMaterial.opacity = isListening || isThinking ? 0.34 + reactive * 0.32 : 0.12;
      trailMaterial.opacity = isExecuting || isSpeaking || isDone ? 0.72 : 0.24;

      rings[0].rotation.z = elapsed * (isThinking ? 0.7 : 0.18);
      rings[1].rotation.z = -elapsed * (isListening ? 0.82 : 0.24);
      rings[2].rotation.z = elapsed * (isExecuting || isSpeaking ? 1.35 : 0.34);
      rings[0].scale.setScalar(1 + pulse * 0.6);
      rings[1].scale.setScalar((isListening ? 1 + Math.sin(elapsed * 4.4) * 0.035 : 1) + reactive * 0.14);
      rings[2].scale.setScalar((isExecuting || isSpeaking ? 1 + Math.sin(elapsed * 6.8) * 0.045 : 1) + reactive * 0.18);

      particleMaterial.color.lerp(isThinking ? cyan : violet, 0.06);
      particleMaterial.opacity = isThinking || isExecuting || isSpeaking ? 0.72 : 0.42;
      particles.rotation.y = elapsed * 0.08;
      particleGroup.position.y = Math.sin(elapsed * 0.42) * 0.08;

      keyLight.intensity = isBlocked ? 4.2 : isExecuting || isSpeaking ? 4.8 : isListening ? 3.8 : 3.1 + reactive * 2.4;
      rimLight.intensity = isListening || isThinking ? 2 + reactive : 1.05;
      violetLight.intensity = isThinking ? 2.2 : 0.85;

      renderer.render(scene, camera);
      frameId = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      cancelAnimationFrame(frameId);
      observer.disconnect();
      mount.removeEventListener("pointermove", onPointerMove);
      mount.removeEventListener("pointerleave", onPointerLeave);
      renderer.dispose();
      head.geometry.dispose();
      snout.geometry.dispose();
      browLeft.geometry.dispose();
      hornLeft.geometry.dispose();
      rings.forEach((ring) => ring.geometry.dispose());
      particleGeometry.dispose();
      [headMaterial, snoutMaterial, hornMaterial, eyeMaterial, ringMaterial, cyanRingMaterial, trailMaterial, particleMaterial].forEach((material) => material.dispose());
      renderer.domElement.remove();
    };
  }, [isWebglAvailable]);

  return <div className={`dragon-3d-canvas ${webglUnavailable ? "is-unavailable" : ""}`} ref={mountRef} />;
}
