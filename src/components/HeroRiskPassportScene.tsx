import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { RoundedBox, Text } from "@react-three/drei";
import { memo, useMemo, useRef } from "react";
import { useReducedMotion } from "motion/react";
import type { Group, PointLight } from "three";
import { Color, MathUtils, MeshPhysicalMaterial } from "three";

type HeroRiskPassportSceneProps = {
  revealStats: boolean;
};

type Candle = {
  body: number;
  close: number;
  high: number;
  low: number;
  open: number;
  x: number;
};

const accent = "#18c887";
const ice = "#dfefff";
const graphite = "#060a0f";

function buildCandles(): Candle[] {
  const closes = [42, 45, 43, 48, 51, 50, 53, 57, 54, 52, 49, 46, 47, 51, 55, 58, 56, 61, 64, 59, 57, 62, 66, 69];
  return closes.map((close, index) => {
    const open = index === 0 ? 40 : closes[index - 1];
    const body = Math.max(1.4, Math.abs(close - open));
    return {
      body,
      close,
      high: Math.max(open, close) + 3 + (index % 3),
      low: Math.min(open, close) - 2 - (index % 4) * 0.75,
      open,
      x: -2.82 + index * 0.245,
    };
  });
}

function SceneRig() {
  const { pointer, viewport } = useThree();
  const shouldReduceMotion = useReducedMotion();
  const groupRef = useRef<Group>(null);
  const keyLightRef = useRef<PointLight>(null);
  const fillLightRef = useRef<PointLight>(null);

  useFrame((state, delta) => {
    if (shouldReduceMotion) {
      return;
    }

    const targetX = MathUtils.clamp(pointer.y * -0.18, -0.12, 0.12);
    const targetY = MathUtils.clamp(pointer.x * 0.28, -0.18, 0.18);
    const targetZ = Math.sin(state.clock.elapsedTime * 0.35) * 0.012;

    if (groupRef.current) {
      groupRef.current.rotation.x = MathUtils.damp(groupRef.current.rotation.x, -0.25 + targetX, 4.2, delta);
      groupRef.current.rotation.y = MathUtils.damp(groupRef.current.rotation.y, -0.38 + targetY, 4.2, delta);
      groupRef.current.rotation.z = MathUtils.damp(groupRef.current.rotation.z, -0.035 + targetZ, 3.5, delta);
      groupRef.current.position.y = MathUtils.damp(groupRef.current.position.y, -0.06 + Math.sin(state.clock.elapsedTime * 0.65) * 0.025, 2.5, delta);
    }

    if (keyLightRef.current) {
      keyLightRef.current.position.x = MathUtils.damp(keyLightRef.current.position.x, pointer.x * viewport.width * 0.34 + 0.5, 5, delta);
      keyLightRef.current.position.y = MathUtils.damp(keyLightRef.current.position.y, pointer.y * viewport.height * 0.18 + 2.4, 5, delta);
    }

    if (fillLightRef.current) {
      fillLightRef.current.intensity = 1.5 + Math.sin(state.clock.elapsedTime * 0.7) * 0.14;
    }
  });

  return (
    <>
      <ambientLight intensity={0.52} />
      <pointLight ref={keyLightRef} color={ice} intensity={3.2} position={[1.4, 2.35, 3.4]} distance={8} />
      <pointLight ref={fillLightRef} color={accent} intensity={1.55} position={[-2.6, -1.05, 2.4]} distance={8} />
      <directionalLight color="#ffffff" intensity={1.1} position={[1.8, 2.8, 2.6]} />
      <group ref={groupRef} position={[0.18, -0.08, 0]} rotation={[-0.25, -0.38, -0.035]} scale={0.88}>
        <RiskPassportObject />
      </group>
      <mesh rotation={[-Math.PI / 2, 0, -0.08]} position={[0.2, -1.58, -0.28]} receiveShadow>
        <planeGeometry args={[8, 4]} />
        <shadowMaterial color="#000000" opacity={0.42} />
      </mesh>
    </>
  );
}

function RiskPassportObject() {
  const candles = useMemo(buildCandles, []);
  const metalMaterial = useMemo(() => new MeshPhysicalMaterial({
    color: new Color(graphite),
    metalness: 0.78,
    roughness: 0.33,
    clearcoat: 0.75,
    clearcoatRoughness: 0.28,
    envMapIntensity: 1.1,
  }), []);
  const edgeMaterial = useMemo(() => new MeshPhysicalMaterial({
    color: new Color("#a9c7ff"),
    emissive: new Color("#102b5f"),
    emissiveIntensity: 0.1,
    metalness: 0.45,
    roughness: 0.2,
    transmission: 0.08,
    thickness: 0.28,
    transparent: true,
    opacity: 0.8,
  }), []);

  return (
    <group>
      <RoundedBox args={[5.85, 3.55, 0.18]} radius={0.16} smoothness={8} position={[0, 0, 0]} castShadow receiveShadow>
        <primitive object={metalMaterial} attach="material" />
      </RoundedBox>
      <RoundedBox args={[5.98, 3.68, 0.075]} radius={0.19} smoothness={8} position={[0, 0, -0.055]} castShadow>
        <primitive object={edgeMaterial} attach="material" />
      </RoundedBox>
      <RoundedBox args={[5.38, 3.03, 0.022]} radius={0.11} smoothness={6} position={[0.02, 0.02, 0.105]}>
        <meshBasicMaterial color="#08131c" transparent opacity={0.72} />
      </RoundedBox>

      <Text fontSize={0.26} letterSpacing={0.16} color="#f7fbff" anchorX="left" anchorY="middle" position={[-2.42, 1.24, 0.14]} material-toneMapped={false}>
        COVA
      </Text>
      <Text fontSize={0.17} letterSpacing={0.22} color="#96ffe0" anchorX="left" anchorY="middle" position={[-2.42, 0.9, 0.14]} material-toneMapped={false}>
        RISK PASSPORT
      </Text>
      <Text fontSize={0.52} color="#ffffff" anchorX="left" anchorY="middle" position={[-2.42, 0.42, 0.14]} material-toneMapped={false}>
        78
      </Text>
      <Text fontSize={0.12} letterSpacing={0.12} color="#aab4bd" anchorX="left" anchorY="middle" position={[-1.68, 0.45, 0.14]} material-toneMapped={false}>
        /100 REVIEW SCORE
      </Text>
      <Text fontSize={0.105} letterSpacing={0.12} color="#b7c1ca" anchorX="left" anchorY="middle" position={[-2.42, -1.16, 0.14]} material-toneMapped={false}>
        DAILY LOSS -$2,640   LIMITS 67%   PF 1.11
      </Text>

      <group position={[0.52, -0.13, 0.15]}>
        {candles.map((candle, index) => {
          const isUp = candle.close >= candle.open;
          const bodyHeight = candle.body * 0.016;
          const wickHeight = (candle.high - candle.low) * 0.016;
          const mid = ((candle.open + candle.close) / 2 - 54) * 0.017;
          const wickMid = ((candle.high + candle.low) / 2 - 54) * 0.017;
          return (
            <group key={`${index}-${candle.close}`} position={[candle.x, 0, 0]}>
              <mesh position={[0, wickMid, 0.02]}>
                <boxGeometry args={[0.012, wickHeight, 0.014]} />
                <meshBasicMaterial color={isUp ? accent : "#b5c0cc"} transparent opacity={isUp ? 0.88 : 0.72} />
              </mesh>
              <mesh position={[0, mid, 0.028]}>
                <boxGeometry args={[0.082, bodyHeight, 0.026]} />
                <meshStandardMaterial
                  color={isUp ? "#37efa9" : "#d9e2ea"}
                  emissive={isUp ? accent : "#607080"}
                  emissiveIntensity={isUp ? 0.38 : 0.08}
                  roughness={0.38}
                  metalness={0.08}
                />
              </mesh>
            </group>
          );
        })}
      </group>

      <CardGrooves />
      <PassportChip />
    </group>
  );
}

function CardGrooves() {
  return (
    <group position={[1.45, -1.02, 0.145]}>
      {Array.from({ length: 4 }).map((_, index) => (
        <mesh key={index} position={[0, index * 0.18, 0]}>
          <boxGeometry args={[1.72 - index * 0.16, 0.018, 0.018]} />
          <meshBasicMaterial color="#7b8896" transparent opacity={0.26} />
        </mesh>
      ))}
    </group>
  );
}

function PassportChip() {
  return (
    <group position={[-1.96, -0.43, 0.16]}>
      <RoundedBox args={[0.58, 0.42, 0.045]} radius={0.055} smoothness={5}>
        <meshStandardMaterial color="#111922" metalness={0.62} roughness={0.22} />
      </RoundedBox>
      {[-0.14, 0, 0.14].map((x) => (
        <mesh key={x} position={[x, 0, 0.038]}>
          <boxGeometry args={[0.018, 0.34, 0.01]} />
          <meshBasicMaterial color="#607080" transparent opacity={0.5} />
        </mesh>
      ))}
      {[-0.09, 0.09].map((y) => (
        <mesh key={y} position={[0, y, 0.04]}>
          <boxGeometry args={[0.48, 0.014, 0.01]} />
          <meshBasicMaterial color="#607080" transparent opacity={0.42} />
        </mesh>
      ))}
    </group>
  );
}

function HeroRiskPassportScene({ revealStats }: HeroRiskPassportSceneProps) {
  return (
    <div className="hero-passport-three-stage" aria-label={revealStats ? "3D Cova Risk Passport preview" : "3D locked Cova Risk Passport preview"}>
      <div className="hero-passport-three-aura" />
      <Canvas
        camera={{ position: [0, 0.18, 6.25], fov: 38 }}
        dpr={[1, 1.75]}
        gl={{ alpha: true, antialias: true, powerPreference: "high-performance" }}
        shadows
      >
        <SceneRig />
      </Canvas>
      <div className="hero-passport-three-callout hero-passport-three-callout-top">
        <span>{revealStats ? "Risk score" : "Hidden until sign-in"}</span>
        <strong>{revealStats ? "78" : "Locked"}</strong>
      </div>
      <div className="hero-passport-three-callout hero-passport-three-callout-bottom">
        <span>{revealStats ? "Limits followed" : "Sign in"}</span>
        <strong>{revealStats ? "67%" : "To unlock"}</strong>
      </div>
    </div>
  );
}

export default memo(HeroRiskPassportScene);
