import type { ComponentProps } from "react";
import type { IconType } from "react-icons";
import {
  FaApple,
  FaBandcamp,
  FaFacebookF,
  FaGlobe,
  FaImdb,
  FaInstagram,
  FaLinkedinIn,
  FaSoundcloud,
  FaSpotify,
  FaTiktok,
  FaTwitter,
  FaVimeoV,
  FaYoutube,
} from "react-icons/fa";
import { SiBeatport } from "react-icons/si";
import {
  detectSocialPlatform,
  type SocialPlatformKey,
} from "@/lib/content/social-platforms";

type SocialPlatformIconProps = Omit<ComponentProps<"span">, "children"> & {
  iconKey?: string;
  platform?: string;
  href?: string;
  label?: string;
};

const iconByPlatform: Record<SocialPlatformKey, IconType> = {
  spotify: FaSpotify,
  soundcloud: FaSoundcloud,
  instagram: FaInstagram,
  youtube: FaYoutube,
  bandcamp: FaBandcamp,
  beatport: SiBeatport,
  "apple-music": FaApple,
  vimeo: FaVimeoV,
  imdb: FaImdb,
  tiktok: FaTiktok,
  facebook: FaFacebookF,
  linkedin: FaLinkedinIn,
  twitter: FaTwitter,
  website: FaGlobe,
};

export default function SocialPlatformIcon({
  iconKey,
  platform,
  href,
  label,
  ...props
}: SocialPlatformIconProps) {
  const key = detectSocialPlatform(iconKey, platform, href, label);
  const Icon = iconByPlatform[key];

  return (
    <span {...props}>
      <Icon aria-hidden="true" />
    </span>
  );
}
