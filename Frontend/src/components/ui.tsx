import React from 'react';
import { View, Text, TextInput, Pressable, TextInputProps } from 'react-native';
import { cn } from '@/lib/cn';

interface InputFieldProps extends TextInputProps {
  label: string;
  containerClassName?: string;
}

export function InputField({ label, containerClassName, className, ...props }: InputFieldProps) {
  return (
    <View className={cn('mb-3', containerClassName)}>
      <Text className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wide">
        {label}
      </Text>
      <TextInput
        className={cn(
          'bg-gray-100 dark:bg-gray-800 rounded-xl px-4 py-3 text-base text-gray-900 dark:text-white',
          className
        )}
        placeholderTextColor="#9CA3AF"
        {...props}
      />
    </View>
  );
}

interface SectionCardProps {
  title: string;
  children: React.ReactNode;
  collapsed?: boolean;
  onToggle?: () => void;
  rightAction?: React.ReactNode;
  className?: string;
}

export function SectionCard({ title, children, collapsed, onToggle, rightAction, className }: SectionCardProps) {
  return (
    <View className={cn('bg-white dark:bg-gray-900 rounded-2xl mb-4 overflow-hidden shadow-sm', className)}>
      <Pressable
        onPress={onToggle}
        className="flex-row items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800"
      >
        <Text className="text-base font-semibold text-gray-900 dark:text-white">{title}</Text>
        <View className="flex-row items-center">
          {rightAction ? <View className="mr-2">{rightAction}</View> : null}
          {onToggle ? (
            <Text className="text-gray-400 text-lg">{collapsed ? '▼' : '▲'}</Text>
          ) : null}
        </View>
      </Pressable>
      {!collapsed ? <View className="p-4">{children}</View> : null}
    </View>
  );
}

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  icon?: React.ReactNode;
  className?: string;
}

export function Button({ title, onPress, variant = 'primary', size = 'md', disabled, icon, className }: ButtonProps) {
  const baseStyles = 'flex-row items-center justify-center rounded-xl';

  const variantStyles = {
    primary: 'bg-orange-500 active:bg-orange-600',
    secondary: 'bg-gray-200 dark:bg-gray-700 active:bg-gray-300 dark:active:bg-gray-600',
    danger: 'bg-red-500 active:bg-red-600',
    ghost: 'bg-transparent active:bg-gray-100 dark:active:bg-gray-800',
  };

  const sizeStyles = {
    sm: 'px-3 py-2',
    md: 'px-4 py-3',
    lg: 'px-6 py-4',
  };

  const textVariantStyles = {
    primary: 'text-white font-semibold',
    secondary: 'text-gray-900 dark:text-white font-medium',
    danger: 'text-white font-semibold',
    ghost: 'text-orange-500 font-medium',
  };

  const textSizeStyles = {
    sm: 'text-sm',
    md: 'text-base',
    lg: 'text-lg',
  };

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      className={cn(
        baseStyles,
        variantStyles[variant],
        sizeStyles[size],
        disabled && 'opacity-50',
        className
      )}
    >
      {icon && <View className="mr-2">{icon}</View>}
      <Text className={cn(textVariantStyles[variant], textSizeStyles[size])}>{title}</Text>
    </Pressable>
  );
}

interface ChipProps {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  color?: string;
}

export function Chip({ label, selected, onPress, color }: ChipProps) {
  return (
    <Pressable
      onPress={onPress}
      className={cn(
        'px-3 py-1.5 rounded-full mr-2 mb-2',
        selected ? 'bg-orange-500' : 'bg-gray-200 dark:bg-gray-700'
      )}
      style={selected && color ? { backgroundColor: color } : undefined}
    >
      <Text
        className={cn(
          'text-sm font-medium',
          selected ? 'text-white' : 'text-gray-700 dark:text-gray-300'
        )}
      >
        {label}
      </Text>
    </Pressable>
  );
}

interface SelectOption {
  label: string;
  value: string;
}

interface SelectFieldProps {
  label: string;
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  containerClassName?: string;
}

export function SelectField({ label, options, value, onChange, containerClassName }: SelectFieldProps) {
  return (
    <View className={cn('mb-3', containerClassName)}>
      <Text className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wide">
        {label}
      </Text>
      <View className="flex-row flex-wrap">
        {options.map((option) => (
          <Chip
            key={option.value}
            label={option.label}
            selected={value === option.value}
            onPress={() => onChange(option.value)}
          />
        ))}
      </View>
    </View>
  );
}

interface ToggleProps {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
}

export function Toggle({ label, value, onChange }: ToggleProps) {
  return (
    <Pressable
      onPress={() => onChange(!value)}
      className="flex-row items-center justify-between py-3"
    >
      <Text className="text-base text-gray-900 dark:text-white">{label}</Text>
      <View
        className={cn(
          'w-12 h-7 rounded-full p-0.5',
          value ? 'bg-orange-500' : 'bg-gray-300 dark:bg-gray-600'
        )}
      >
        <View
          className={cn(
            'w-6 h-6 rounded-full bg-white shadow',
            value ? 'ml-5' : 'ml-0'
          )}
        />
      </View>
    </Pressable>
  );
}

interface EmptyStateProps {
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <View className="items-center justify-center py-8">
      <Text className="text-lg font-medium text-gray-500 dark:text-gray-400 mb-1">{title}</Text>
      {description && (
        <Text className="text-sm text-gray-400 dark:text-gray-500 text-center mb-4">{description}</Text>
      )}
      {action}
    </View>
  );
}
