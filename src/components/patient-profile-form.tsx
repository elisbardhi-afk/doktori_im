"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AvatarUploader } from "@/components/avatar-uploader";
import { UserRow } from "@/lib/database.types";
import { updateUserProfile } from "@/actions/user-profile";

const ALBANIAN_CITIES = [
  "Tiranë",
  "Durrës",
  "Vlorë",
  "Shkodër",
  "Elbasan",
  "Fier",
  "Korçë",
  "Berat",
  "Lushnjë",
  "Kavajë",
  "Gjirokastër",
  "Sarandë",
  "Lezhë",
  "Kukës",
  "Peshkopi",
  "Pogradec",
  "Laç",
  "Krujë",
  "Rrogozhinë",
  "Patos",
  "Cërrik",
  "Burrel",
  "Gramsh",
  "Librazhd",
  "Përmet",
  "Tepelenë",
  "Ersekë",
  "Bajram Curri",
  "Has",
  "Bulqizë",
  "Dibër",
  "Mallakastër",
];

interface PatientProfileFormProps {
  initialData: UserRow;
}

interface FormData {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  postalCode: string;
}

interface FormErrors {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  postalCode?: string;
}

export function PatientProfileForm({ initialData }: PatientProfileFormProps) {
  const t = useTranslations("profile");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [avatarUrl, setAvatarUrl] = useState<string | null>(initialData.avatar_url ?? null);

  // Parse full_name into firstName and lastName
  const parsedName = initialData.full_name
    ? initialData.full_name.split(" ")
    : ["", ""];
  const firstName =
    parsedName.length > 1 ? parsedName.slice(0, -1).join(" ") : parsedName[0];
  const lastName = parsedName.length > 1 ? parsedName[parsedName.length - 1] : "";

  const [formData, setFormData] = useState<FormData>({
    firstName: firstName || "",
    lastName: lastName || "",
    email: initialData.email || "",
    phone: initialData.phone || "",
    address: initialData.address || "",
    city: initialData.city || "",
    postalCode: initialData.postal_code || "",
  });

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement>,
    field: keyof FormData
  ) => {
    const { value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));

    // Clear error for this field when user starts typing
    if (errors[field]) {
      setErrors((prev) => ({
        ...prev,
        [field]: undefined,
      }));
    }
  };

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};

    // firstName validation
    if (!formData.firstName || formData.firstName.trim() === "") {
      newErrors.firstName = t("errors.firstNameRequired");
    } else if (formData.firstName.trim().length > 50) {
      newErrors.firstName = t("errors.firstNameTooLong");
    }

    // lastName validation
    if (!formData.lastName || formData.lastName.trim() === "") {
      newErrors.lastName = t("errors.lastNameRequired");
    } else if (formData.lastName.trim().length > 50) {
      newErrors.lastName = t("errors.lastNameTooLong");
    }

    // phone validation
    if (!formData.phone || formData.phone.trim() === "") {
      newErrors.phone = t("errors.phoneRequired");
    }

    // address validation (optional but has max length)
    if (formData.address && formData.address.length > 150) {
      newErrors.address = t("errors.addressTooLong");
    }

    // city validation (optional but must be in list if provided)
    if (formData.city && !ALBANIAN_CITIES.includes(formData.city)) {
      newErrors.city = t("errors.cityInvalid");
    }

    // postalCode validation (optional but has max length)
    if (formData.postalCode && formData.postalCode.length > 20) {
      newErrors.postalCode = t("errors.postalCodeTooLong");
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await updateUserProfile({
        firstName: formData.firstName.trim(),
        lastName: formData.lastName.trim(),
        phone: formData.phone.trim(),
        address: formData.address ? formData.address.trim() : undefined,
        city: formData.city || undefined,
        postalCode: formData.postalCode || undefined,
      });

      if (result.success) {
        // Store city in localStorage on success
        if (formData.city) {
          localStorage.setItem("preferredCity", formData.city);
        }
        toast.success(t("saveSuccess"), {
          description: t("saveSuccessDescription"),
          duration: 3000,
        });
      } else {
        toast.error(t("saveError"), {
          description: result.error || t("saveErrorDescription"),
          duration: 4000,
        });
      }
    } catch (error) {
      console.error("Error updating profile:", error);
      toast.error(t("saveError"), {
        description: t("saveErrorDescription"),
        duration: 4000,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const initials = (name: string) =>
    name
      .split(" ")
      .filter(Boolean)
      .map((w) => w[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?";

  return (
    <div className="max-w-2xl space-y-6">
      {/* Profile photo */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("photo")}</CardTitle>
        </CardHeader>
        <CardContent>
          <AvatarUploader
            currentUrl={avatarUrl}
            fallbackText={initials(initialData.full_name ?? "")}
            role="patient"
            onUploaded={(url) => setAvatarUrl(url)}
          />
        </CardContent>
      </Card>

      <form onSubmit={handleSubmit} className="space-y-6">
      {/* First Name */}
      <div className="space-y-2">
        <Label htmlFor="firstName">
          {t("firstName")} <span className="text-red-500">*</span>
        </Label>
        <Input
          id="firstName"
          type="text"
          placeholder={t("firstName")}
          value={formData.firstName}
          onChange={(e) => handleInputChange(e, "firstName")}
          className={errors.firstName ? "border-red-500" : ""}
          disabled={isSubmitting}
        />
        {errors.firstName && (
          <p className="text-sm text-red-500">{errors.firstName}</p>
        )}
      </div>

      {/* Last Name */}
      <div className="space-y-2">
        <Label htmlFor="lastName">
          {t("lastName")} <span className="text-red-500">*</span>
        </Label>
        <Input
          id="lastName"
          type="text"
          placeholder={t("lastName")}
          value={formData.lastName}
          onChange={(e) => handleInputChange(e, "lastName")}
          className={errors.lastName ? "border-red-500" : ""}
          disabled={isSubmitting}
        />
        {errors.lastName && (
          <p className="text-sm text-red-500">{errors.lastName}</p>
        )}
      </div>

      {/* Email (read-only) */}
      <div className="space-y-2">
        <Label htmlFor="email">
          {t("email")}
        </Label>
        <Input
          id="email"
          type="email"
          value={formData.email}
          disabled={true}
          className="bg-muted"
        />
        <p className="text-xs text-muted-foreground">{t("emailReadOnly")}</p>
      </div>

      {/* Phone */}
      <div className="space-y-2">
        <Label htmlFor="phone">
          {t("phone")} <span className="text-red-500">*</span>
        </Label>
        <Input
          id="phone"
          type="tel"
          placeholder={t("phone")}
          value={formData.phone}
          onChange={(e) => handleInputChange(e, "phone")}
          className={errors.phone ? "border-red-500" : ""}
          disabled={isSubmitting}
        />
        {errors.phone && (
          <p className="text-sm text-red-500">{errors.phone}</p>
        )}
      </div>

      {/* Address */}
      <div className="space-y-2">
        <Label htmlFor="address">
          {t("address")}
        </Label>
        <Input
          id="address"
          type="text"
          placeholder={t("addressPlaceholder")}
          value={formData.address}
          onChange={(e) => handleInputChange(e, "address")}
          className={errors.address ? "border-red-500" : ""}
          disabled={isSubmitting}
        />
        {errors.address && (
          <p className="text-sm text-red-500">{errors.address}</p>
        )}
      </div>

      {/* City (with datalist) */}
      <div className="space-y-2">
        <Label htmlFor="city">
          {t("city")}
        </Label>
        <Input
          id="city"
          type="text"
          placeholder={t("cityPlaceholder")}
          value={formData.city}
          onChange={(e) => handleInputChange(e, "city")}
          list="cities-list"
          className={errors.city ? "border-red-500" : ""}
          disabled={isSubmitting}
        />
        <datalist id="cities-list">
          {ALBANIAN_CITIES.map((city) => (
            <option key={city} value={city} />
          ))}
        </datalist>
        {errors.city && (
          <p className="text-sm text-red-500">{errors.city}</p>
        )}
      </div>

      {/* Postal Code */}
      <div className="space-y-2">
        <Label htmlFor="postalCode">
          {t("postalCode")}
        </Label>
        <Input
          id="postalCode"
          type="text"
          placeholder={t("postalCodePlaceholder")}
          value={formData.postalCode}
          onChange={(e) => handleInputChange(e, "postalCode")}
          className={errors.postalCode ? "border-red-500" : ""}
          disabled={isSubmitting}
        />
        {errors.postalCode && (
          <p className="text-sm text-red-500">{errors.postalCode}</p>
        )}
      </div>

      {/* Submit Button */}
      <Button
        type="submit"
        disabled={isSubmitting}
        className="w-full md:w-auto"
      >
        {isSubmitting ? t("saving") : t("save")}
      </Button>
      </form>
    </div>
  );
}
