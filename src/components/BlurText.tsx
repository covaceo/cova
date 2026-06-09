import { motion } from "motion/react";

type BlurTextProps = {
  text: string;
  className?: string;
  delay?: number;
};

export function BlurText({ text, className, delay = 0.04 }: BlurTextProps) {
  const words = text.split(" ");

  return (
    <span className={className}>
      {words.flatMap((word, index) => [
        <motion.span
          key={`${word}-${index}`}
          className="inline-block"
          initial={{ opacity: 0, y: 46 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.78, delay: index * delay, ease: [0.16, 1, 0.3, 1] }}
        >
          {word}
        </motion.span>,
        index < words.length - 1 ? " " : null,
      ])}
    </span>
  );
}
